// Bộ xuất Word (.docx, nhúng ảnh, đánh dấu đáp án đúng) và Excel (.xlsx) — đồng bộ với tiện ích V4.5.
function hvuGenerateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function escapeH(t) {
    return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(t) {
    return String(t || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Nhúng ảnh vào DOCX.
// Word chỉ đọc chắc chắn PNG/JPEG/GIF/BMP trong gói OOXML, nên ảnh lạ
// (webp, avif, svg...) sẽ được background chuyển sang PNG trước khi trả về.
// ---------------------------------------------------------------------------
var HVU_DOCX_MAX_IMG_CX = 5486400;   // 6 inch, tính bằng EMU
var HVU_DOCX_MAX_IMG_CY = 7315200;   // 8 inch
var HVU_DOCX_EMU_PER_PX = 9525;      // 96 dpi

function _hvuBase64ToBytes(b64) {
    var clean = String(b64 || '').replace(/^data:[^,]*;base64,/, '').replace(/\s+/g, '');
    if (!clean) return null;
    var bin;
    try { bin = atob(clean); } catch (e) { return null; }
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xFF;
    return out;
}

function _hvuJpegSize(b) {
    var i = 2;
    while (i < b.length - 9) {
        if (b[i] !== 0xFF) { i++; continue; }
        var marker = b[i + 1];
        if (marker === 0xFF) { i++; continue; }   // byte đệm 0xFF
        if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
        var len = (b[i + 2] << 8) | b[i + 3];
        if (len < 2) break;
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
            return { width: (b[i + 7] << 8) | b[i + 8], height: (b[i + 5] << 8) | b[i + 6] };
        }
        i += 2 + len;
    }
    return { width: 0, height: 0 };
}

// Nhận dạng ảnh từ magic bytes; trả null nếu Word không đọc được.
function _hvuImageInfoFromBytes(bytes) {
    if (!bytes || bytes.length < 12) return null;
    var w = 0, h = 0, ext = '', mime = '';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
        ext = 'png'; mime = 'image/png';
        w = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
        h = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
    } else if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
        ext = 'jpg'; mime = 'image/jpeg';
        var size = _hvuJpegSize(bytes);
        w = size.width; h = size.height;
    } else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
        ext = 'gif'; mime = 'image/gif';
        w = bytes[6] | (bytes[7] << 8);
        h = bytes[8] | (bytes[9] << 8);
    } else if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
        ext = 'bmp'; mime = 'image/bmp';
        w = bytes[18] | (bytes[19] << 8) | (bytes[20] << 16) | (bytes[21] << 24);
        h = Math.abs(bytes[22] | (bytes[23] << 8) | (bytes[24] << 16) | (bytes[25] << 24));
    } else {
        return null;
    }
    if (!(w > 0) || !(h > 0)) { w = 600; h = 400; }
    return { bytes: bytes, ext: ext, mime: mime, width: w, height: h };
}

// Tên file hiển thị khi ảnh không nhúng được. ID nội bộ và key S3 là vô nghĩa
// với người đọc nên chỉ in "[Hình ảnh]".
function _hvuImageFallbackLabel(src) {
    var name = '';
    try {
        var clean = String(src || '').split('?')[0].split('#')[0];
        name = decodeURIComponent(clean.split('/').pop() || '');
    } catch (e) { name = ''; }
    var bare = !name;
    if (name) {
        var stem = name.replace(/\.[a-z0-9]{1,5}$/i, '');
        if (/^\d+$/.test(stem)) bare = true;                               // 291400
        else if (/^[a-z]?\d{2,}[a-z0-9]{6,}$/i.test(stem)) bare = true;    // s144untfqeujk69f9670738uo
        else if (/^[0-9a-f]{16,}$/i.test(stem)) bare = true;               // hash
    }
    if (bare) return '[Hình ảnh]';
    return '[Hình ảnh: ' + name.substring(0, 60) + ']';
}

// Dựng thẻ <w:drawing> nhúng ảnh, kèm đăng ký phần media + relationship.
function _hvuMakeImageRun(src, imageMap, ctx) {
    var info = imageMap && imageMap[src];
    if (!info || !info.bytes || !info.bytes.length) return '';

    var relId = ctx.srcToRel[src];
    var fileName = '';
    if (!relId) {
        ctx.imgIndex += 1;
        relId = 'rIdImg' + ctx.imgIndex;
        fileName = 'image' + ctx.imgIndex + '.' + (info.ext || 'png');
        ctx.srcToRel[src] = relId;
        ctx.images.push({ relId: relId, fileName: fileName, bytes: info.bytes, ext: info.ext || 'png' });
    } else {
        var rec = ctx.images.filter(function (r) { return r.relId === relId; })[0];
        fileName = rec ? rec.fileName : 'image';
    }

    var cx = info.width * HVU_DOCX_EMU_PER_PX;
    var cy = info.height * HVU_DOCX_EMU_PER_PX;
    var scale = 1;
    if (cx > HVU_DOCX_MAX_IMG_CX) scale = HVU_DOCX_MAX_IMG_CX / cx;
    if (cy * scale > HVU_DOCX_MAX_IMG_CY) scale = Math.min(scale, HVU_DOCX_MAX_IMG_CY / cy);
    cx = Math.max(1, Math.round(cx * scale));
    cy = Math.max(1, Math.round(cy * scale));

    ctx.docPrId += 1;
    var id = ctx.docPrId;

    return '<w:r><w:drawing>'
        + '<wp:inline distT="0" distB="0" distL="0" distR="0">'
        + '<wp:extent cx="' + cx + '" cy="' + cy + '"/>'
        + '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
        + '<wp:docPr id="' + id + '" name="Picture ' + id + '"/>'
        + '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
        + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
        + '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        + '<pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + _hvuEscXml(fileName) + '"/><pic:cNvPicPr/></pic:nvPicPr>'
        + '<pic:blipFill><a:blip r:embed="' + relId + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>'
        + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
        + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
}

// Gom toàn bộ src ảnh trong một chuỗi HTML, giữ nguyên thứ tự xuất hiện.
function _hvuCollectImageSources(html) {
    var srcs = [];
    try {
        var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
        var imgs = doc.querySelectorAll('img[src]');
        var seen = Object.create(null);
        for (var i = 0; i < imgs.length; i++) {
            var src = imgs[i].getAttribute('src') || '';
            if (!src || seen[src]) continue;
            seen[src] = true;
            srcs.push(src);
        }
    } catch (e) { }
    return srcs;
}

// Tách fileId từ src ảnh: .../api/aws/file/291400 hoặc dạng số trần .../291400.
function _hvuFileIdFromSrc(src) {
    var s = String(src || '');
    var m = s.match(/\/file\/(\d+)/);
    if (m) return m[1];
    var clean = s.split('?')[0].split('#')[0];
    var last = clean.split('/').pop() || '';
    m = last.match(/^(\d{3,})(?:\.[a-z0-9]{1,5})?$/i);
    return m ? m[1] : '';
}

// ---------------------------------------------------------------------------
// Website: ảnh lấy từ thư mục images/ trong repo dữ liệu GitHub (do tiện ích đẩy lên).
// app.js khai báo window.hvuWebImages = { bytes(src) -> Promise<Uint8Array|null> }.
// ---------------------------------------------------------------------------
function _hvuResolveImageBytes(src) {
    var provider = (typeof window !== 'undefined') && window.hvuWebImages;
    if (!provider || !_hvuFileIdFromSrc(src)) return Promise.resolve(null);
    return provider.bytes(src).then(function (bytes) {
        return bytes && bytes.length ? _hvuImageInfoFromBytes(bytes) : null;
    }).catch(function () { return null; });
}

// Tải ảnh song song (tối đa 4) và dựng map { src: {bytes, ext, width, height} }.
function _hvuLoadImageMap(html, onProgress) {
    var srcs = _hvuCollectImageSources(html);
    var map = Object.create(null);
    if (!srcs.length) return Promise.resolve(map);

    return new Promise(function (resolve) {
        var nextIdx = 0;
        var done = 0;
        var LIMIT = 4;

        function pump() {
            if (nextIdx >= srcs.length) return;
            var src = srcs[nextIdx++];
            _hvuResolveImageBytes(src)
                .catch(function () { return null; })
                .then(function (info) {
                    if (info) map[src] = info;
                    else map[src] = null;
                    done += 1;
                    if (onProgress) {
                        try { onProgress(done, srcs.length); } catch (e) { }
                    }
                    if (done >= srcs.length) resolve(map);
                    else pump();
                });
        }

        for (var i = 0; i < Math.min(LIMIT, srcs.length); i++) pump();
    });
}

function renderMediaHtml(media, context) {
    if (!media || media.length === 0) return '';
    var html = '';
    var isPopup = context === 'popup';
    var isWord = context === 'word';

    media.forEach(function (m) {
        if (m.type === 'image') {
            if (isWord) {
                html += '<div style="margin:8px 0"><img src="' + escapeAttr(m.src) + '" style="max-width:100%;height:auto" /></div>';
            } else {
                html += '<div class="hvu-media-item"><img src="' + escapeAttr(m.src) + '" class="hvu-media-img'
                    + (isPopup ? ' hvu-media-sm' : '') + '" loading="lazy"'
                    + ' data-hvu-fallback />'
                    + '<div class="hvu-media-fallback" style="display:none">' + (typeof hvuIcon === 'function' ? hvuIcon('image', 14) : '[IMG]') + ' ' + escapeH(_hvuImageFallbackLabel(m.src)) + '</div></div>';
            }
        } else if (m.type === 'video') {
            if (isWord) {
                html += '<div style="margin:8px 0"><a href="' + escapeAttr(m.src) + '">[Video: ' + escapeH(m.src) + ']</a></div>';
            } else {
                html += '<div class="hvu-media-item"><video src="' + escapeAttr(m.src) + '" controls class="hvu-media-video'
                    + (isPopup ? ' hvu-media-sm' : '') + '"'
                    + ' data-hvu-fallback></video>'
                    + '<div class="hvu-media-fallback" style="display:none">' + (typeof hvuIcon === 'function' ? hvuIcon('film', 14) : '[VID]') + ' ' + escapeH(m.src.split('/').pop().substring(0, 40)) + '</div></div>';
            }
        } else if (m.type === 'audio') {
            if (isWord) {
                html += '<div style="margin:8px 0"><a href="' + escapeAttr(m.src) + '">[Audio: ' + escapeH(m.src) + ']</a></div>';
            } else {
                html += '<div class="hvu-media-item"><audio src="' + escapeAttr(m.src) + '" controls class="hvu-media-audio"'
                    + ' data-hvu-fallback></audio>'
                    + '<div class="hvu-media-fallback" style="display:none">' + (typeof hvuIcon === 'function' ? hvuIcon('music', 14) : '[AUD]') + ' ' + escapeH(m.src.split('/').pop().substring(0, 40)) + '</div></div>';
            }
        }
    });

    return html;
}

function initMediaFallbacks(container) {
    if (!container) return;
    var els = container.querySelectorAll('[data-hvu-fallback]');
    els.forEach(function (el) {
        el.addEventListener('error', function () {
            this.style.display = 'none';
            var fallback = this.nextElementSibling;
            if (fallback && fallback.classList.contains('hvu-media-fallback')) {
                fallback.style.display = 'block';
            }
        });
    });
}

function renderMediaText(media) {
    if (!media || media.length === 0) return '';
    var lines = '';
    media.forEach(function (m) {
        lines += '  [' + m.type.toUpperCase() + ': ' + m.src + ']\n';
    });
    return lines;
}

// ---------------------------------------------------------------------------
// Đáp án đúng đã được xác nhận.
// LMS không trả về đáp án đúng, chỉ trả điểm. Chỉ khi điểm tuyệt đối (100%) thì mọi
// đáp án đã chọn mới chắc chắn đúng. Điểm thấp hơn thì không thể biết câu nào sai nên
// không được ghi đáp án nào là "đúng".
// ---------------------------------------------------------------------------
function hvuIsPerfectScore(sc) {
    if (!sc) return false;
    if (sc.perfect === true) return true;
    if (sc.perfect === false) return false;
    // Điểm cũ lưu trước phiên bản 4.4 chưa có cờ perfect: chỉ tin khi đủ 100 điểm.
    var total = Number(sc.total) || 0;
    var correct = Number(sc.correct) || 0;
    return Number(sc.value) >= 100 && (!total || correct >= total);
}

function _hvuNormOpt(t) {
    return String(t == null ? '' : t).trim().toLowerCase().replace(/\s+/g, ' ');
}

// Vị trí (từ 0) của đáp án đúng trong q.options, hoặc -1 nếu chưa biết.
// Ưu tiên theo id lựa chọn; không có thì so theo nội dung chữ.
function hvuCorrectIndex(q) {
    if (!q || !Array.isArray(q.options)) return -1;
    var opts = q.options, i, o;
    if (q.correctId !== undefined && q.correctId !== null && q.correctId !== '') {
        for (i = 0; i < opts.length; i++) {
            o = opts[i];
            if (o && typeof o === 'object' && String(o.id) === String(q.correctId)) return i;
        }
    }
    var want = _hvuNormOpt(q.correctAnswer);
    if (want) {
        for (i = 0; i < opts.length; i++) {
            o = opts[i];
            var v = (o && typeof o === 'object') ? o.value : o;
            if (_hvuNormOpt(v) === want) return i;
        }
    }
    return -1;
}

var HVU_CORRECT_MARK = ' \u2713 \u0110\u00DANG';
var HVU_CORRECT_STYLE = 'color:#0f9d6c;font-weight:bold';

function generateWordHtml(questions, title) {
    var h = '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">'
        + '<head><meta charset="UTF-8"><style>'
        + 'body{font-family:"Times New Roman",serif;font-size:12pt;line-height:1.8;margin:40px}'
        + '.q{font-weight:bold;margin-top:20px;padding:8px;background:#eaf3ff;border-left:4px solid #2563eb}'
        + '.o{margin-left:30px;margin-bottom:6px;padding:4px 0}'
        + '.hdr{text-align:center;margin-bottom:20px}'
        + '.info{background:#eaf3ff;padding:10px;border-radius:5px;margin-bottom:15px}'
        + '</style></head><body>'
        + '<div class="hdr"><h2>' + escapeH(title) + '</h2></div>'
        + '<div class="info"><p>Tổng: ' + questions.length + ' câu | Xuất lúc: ' + new Date().toLocaleString('vi-VN') + '</p></div><hr>';

    questions.forEach(function (q, i) {
        h += '<div class="q">Câu ' + (i + 1) + ': ' + escapeH(q.text) + '</div>';
        h += renderMediaHtml(q.media, 'word');
        var correctIdx = hvuCorrectIndex(q);
        (q.options || []).forEach(function (o, j) {
            var val = typeof o === 'object' ? o.value : o;
            var oMedia = typeof o === 'object' ? o.media : null;
            var hasMedia = oMedia && oMedia.length > 0;
            var isRight = j === correctIdx;
            h += '<div class="o"' + (isRight ? ' style="' + HVU_CORRECT_STYLE + '"' : '') + '>'
                + String.fromCharCode(65 + j) + '. ' + escapeH(val || (hasMedia ? '' : '—'))
                + (isRight ? HVU_CORRECT_MARK : '') + '</div>';
            h += renderMediaHtml(oMedia, 'word');
        });
    });

    h += '</body></html>';
    return h;
}

var _hvuCrc32Table = null;
function _hvuCrc32(data) {
    if (!_hvuCrc32Table) {
        _hvuCrc32Table = new Uint32Array(256);
        for (var i = 0; i < 256; i++) {
            var c = i;
            for (var j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            _hvuCrc32Table[i] = c;
        }
    }
    var crc = 0xFFFFFFFF;
    for (var k = 0; k < data.length; k++) crc = _hvuCrc32Table[(crc ^ data[k]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function _hvuStrToUtf8(str) { return new TextEncoder().encode(str); }

function _hvuCreateZip(files) {
    var parts = [], centralHeaders = [], offset = 0;
    for (var i = 0; i < files.length; i++) {
        var nameBytes = _hvuStrToUtf8(files[i].name);
        var data = files[i].data;
        var crcVal = _hvuCrc32(data);
        var local = new Uint8Array(30 + nameBytes.length);
        var lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(8, 0, true);
        lv.setUint32(14, crcVal, true);
        lv.setUint32(18, data.length, true);
        lv.setUint32(22, data.length, true);
        lv.setUint16(26, nameBytes.length, true);
        local.set(nameBytes, 30);
        parts.push(local);
        parts.push(data);
        var central = new Uint8Array(46 + nameBytes.length);
        var cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint32(16, crcVal, true);
        cv.setUint32(20, data.length, true);
        cv.setUint32(24, data.length, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint32(42, offset, true);
        central.set(nameBytes, 46);
        centralHeaders.push(central);
        offset += 30 + nameBytes.length + data.length;
    }
    var centralStart = offset, centralSize = 0;
    for (var j = 0; j < centralHeaders.length; j++) { parts.push(centralHeaders[j]); centralSize += centralHeaders[j].length; }
    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, centralStart, true);
    parts.push(eocd);
    var totalSize = 0;
    for (var p = 0; p < parts.length; p++) totalSize += parts[p].length;
    var result = new Uint8Array(totalSize);
    var pos = 0;
    for (var q = 0; q < parts.length; q++) { result.set(parts[q], pos); pos += parts[q].length; }
    return result;
}

function _hvuEscXml(s) {
    return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function _hvuHtmlToOoxmlBody(html, imageMap, imageCtx) {
    imageCtx = imageCtx || { images: [], srcToRel: Object.create(null), imgIndex: 0, docPrId: 0 };
    var parser = new DOMParser();
    var doc = parser.parseFromString(String(html || ''), 'text/html');
    var body = doc.body;
    var xml = '';

    function cloneProps(p) {
        return { b: !!p.b, i: !!p.i, u: !!p.u, c: p.c || null, sz: p.sz || null };
    }

    function cssValue(style, property) {
        var re = new RegExp('(?:^|;)\\s*' + property + '\\s*:\\s*([^;]+)', 'i');
        var m = String(style || '').match(re);
        return m ? m[1].trim() : '';
    }

    function colorHex(value) {
        value = String(value || '').trim();
        if (/^#[0-9a-f]{3}$/i.test(value)) {
            return value.substring(1).split('').map(function (c) { return c + c; }).join('').toUpperCase();
        }
        if (/^#[0-9a-f]{6}$/i.test(value)) return value.substring(1).toUpperCase();
        var rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (rgb) return [rgb[1], rgb[2], rgb[3]].map(function (n) {
            var hex = Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).toUpperCase();
            return hex.length < 2 ? '0' + hex : hex;
        }).join('');
        return null;
    }

    function readableWordColor(hex) {
        if (!hex || hex.length !== 6) return hex;
        var r = parseInt(hex.substring(0, 2), 16);
        var g = parseInt(hex.substring(2, 4), 16);
        var b = parseInt(hex.substring(4, 6), 16);
        var luminance = (r * 299 + g * 587 + b * 114) / 1000;
        if (luminance >= 185) return '222222';
        if (luminance >= 130) return '444444';
        return hex;
    }

    function applyNodeProps(node, inherited) {
        var props = cloneProps(inherited || {});
        if (!node || node.nodeType !== 1) return props;
        var tag = node.tagName.toLowerCase();
        var style = node.getAttribute('style') || '';
        if (tag === 'strong' || tag === 'b' || /^h[1-6]$/.test(tag)) props.b = true;
        if (tag === 'em' || tag === 'i') props.i = true;
        if (tag === 'u') props.u = true;
        var weight = cssValue(style, 'font-weight');
        if (weight && (weight.toLowerCase() === 'bold' || parseInt(weight, 10) >= 600)) props.b = true;
        var fontStyle = cssValue(style, 'font-style');
        if (fontStyle.toLowerCase() === 'italic' || fontStyle.toLowerCase() === 'oblique') props.i = true;
        var decoration = cssValue(style, 'text-decoration');
        if (decoration.toLowerCase().indexOf('underline') !== -1) props.u = true;
        var color = colorHex(cssValue(style, 'color'));
        if (color) props.c = readableWordColor(color);
        var size = cssValue(style, 'font-size').match(/([\d.]+)\s*(px|pt)?/i);
        if (size) {
            var n = parseFloat(size[1]);
            var unit = (size[2] || 'px').toLowerCase();
            var halfPoints = Math.round(unit === 'pt' ? n * 2 : n * 1.5);
            if (halfPoints > 0 && halfPoints <= 144) props.sz = halfPoints;
        }
        return props;
    }

    function cleanText(value) {
        return String(value == null ? '' : value)
            .replace(/\r\n?/g, '\n')
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    }

    function makeRun(text, props) {
        text = cleanText(text);
        if (!text) return '';
        props = props || {};
        var rpr = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>';
        if (props.b) rpr += '<w:b/>';
        if (props.i) rpr += '<w:i/>';
        if (props.c) rpr += '<w:color w:val="' + props.c + '"/>';
        if (props.sz) rpr += '<w:sz w:val="' + props.sz + '"/><w:szCs w:val="' + props.sz + '"/>';
        if (props.u) rpr += '<w:u w:val="single"/>';
        var rprXml = '<w:rPr>' + rpr + '</w:rPr>';
        var chunks = text.split('\n');
        var out = '';
        for (var i = 0; i < chunks.length; i++) {
            if (i > 0) out += '<w:r><w:br/></w:r>';
            if (chunks[i]) out += '<w:r>' + rprXml + '<w:t xml:space="preserve">' + _hvuEscXml(chunks[i]) + '</w:t></w:r>';
        }
        return out;
    }

    function collectRuns(node, inherited) {
        if (!node) return '';
        if (node.nodeType === 3) return makeRun(node.nodeValue, inherited);
        if (node.nodeType !== 1) return '';
        var tag = node.tagName.toLowerCase();
        var style = node.getAttribute('style') || '';
        if (['style', 'script', 'head', 'meta', 'link'].indexOf(tag) !== -1) return '';
        if (/display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style)) return '';
        var props = applyNodeProps(node, inherited);
        if (tag === 'img') {
            var src = node.getAttribute('src') || '';
            // Nhúng ảnh thật nếu đã tải được bytes; nếu không, in nhãn thay vì ID/khóa S3 thô.
            var picture = _hvuMakeImageRun(src, imageMap, imageCtx);
            if (picture) return picture;
            return makeRun(_hvuImageFallbackLabel(src), { b: false, i: true, u: false, c: '0563C1', sz: props.sz });
        }
        if (tag === 'audio' || tag === 'video') {
            return makeRun(tag === 'audio' ? '[Âm thanh]' : '[Video]', { b: false, i: true, u: false, c: '0563C1', sz: props.sz });
        }
        if (tag === 'br') return '<w:r><w:br/></w:r>';
        var runs = '';
        for (var i = 0; i < node.childNodes.length; i++) runs += collectRuns(node.childNodes[i], props);
        return runs;
    }

    function hasBlockChild(el) {
        var blockTags = ['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'main', 'header', 'footer', 'blockquote', 'table', 'tr', 'td', 'th', 'ul', 'ol'];
        for (var i = 0; i < el.children.length; i++) {
            if (blockTags.indexOf(el.children[i].tagName.toLowerCase()) !== -1) return true;
        }
        return false;
    }

    function hasDirectInlineContent(el) {
        for (var i = 0; i < el.childNodes.length; i++) {
            var n = el.childNodes[i];
            if (n.nodeType === 3 && n.nodeValue.trim()) return true;
            if (n.nodeType === 1) {
                var tag = n.tagName.toLowerCase();
                if (['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'main', 'header', 'footer', 'blockquote', 'table', 'tr', 'td', 'th', 'ul', 'ol'].indexOf(tag) === -1
                    && !/display\s*:\s*none/i.test(n.getAttribute('style') || '')
                    && (n.textContent.trim() || ['img', 'video', 'audio', 'br'].indexOf(tag) !== -1)) return true;
            }
        }
        return false;
    }

    function collectDirectRuns(el, inherited) {
        var runs = '';
        for (var i = 0; i < el.childNodes.length; i++) {
            var n = el.childNodes[i];
            if (n.nodeType === 3) {
                if (n.nodeValue.trim()) runs += collectRuns(n, inherited);
            } else if (n.nodeType === 1) {
                var tag = n.tagName.toLowerCase();
                if (['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'main', 'header', 'footer', 'blockquote', 'table', 'tr', 'td', 'th', 'ul', 'ol'].indexOf(tag) === -1) {
                    runs += collectRuns(n, inherited);
                }
            }
        }
        return runs;
    }

    function emitPara(runs, opts) {
        opts = opts || {};
        var ppr = '';
        if (opts.heading) ppr += '<w:pStyle w:val="Heading' + opts.heading + '"/>';
        if (opts.keepNext) ppr += '<w:keepNext/>';
        if (opts.pageBreakBefore) ppr += '<w:pageBreakBefore/>';
        if (opts.borderLeft || opts.borderBottom) {
            ppr += '<w:pBdr>';
            if (opts.borderLeft) ppr += '<w:left w:val="single" w:sz="12" w:space="4" w:color="' + opts.borderLeft + '"/>';
            if (opts.borderBottom) ppr += '<w:bottom w:val="single" w:sz="6" w:space="1" w:color="' + opts.borderBottom + '"/>';
            ppr += '</w:pBdr>';
        }
        if (opts.shading) ppr += '<w:shd w:val="clear" w:color="auto" w:fill="' + opts.shading + '"/>';
        if (opts.spacing) ppr += '<w:spacing w:before="' + opts.spacing.before + '" w:after="' + opts.spacing.after + '"/>';
        if (opts.indent) ppr += '<w:ind w:left="' + opts.indent + '"/>';
        if (opts.align) ppr += '<w:jc w:val="' + opts.align + '"/>';
        var pprXml = ppr ? '<w:pPr>' + ppr + '</w:pPr>' : '';
        xml += '<w:p>' + pprXml + (runs || '<w:r><w:t></w:t></w:r>') + '</w:p>';
    }

    function processEl(el, inherited) {
        if (!el || el.nodeType !== 1) return;
        var tag = el.tagName.toLowerCase();
        var style = el.getAttribute('style') || '';
        var cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
        if (['style', 'script', 'head', 'meta', 'link'].indexOf(tag) !== -1) return;
        if (/display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style)) return;

        if (tag === 'hr') {
            emitPara('', { borderBottom: 'AAAAAA', spacing: { before: 120, after: 120 } });
            return;
        }
        if (tag === 'br') {
            emitPara('<w:r><w:br/></w:r>');
            return;
        }

        var props = applyNodeProps(el, inherited || { b: false, i: false, u: false, c: null, sz: null });
        var tagIsBlock = ['h1','h2','h3','h4','h5','h6','p','div','li','section','article','main','header','footer','blockquote','td','th'].indexOf(tag) !== -1;
        var structural = ['html','body','ul','ol','table','tbody','thead','tfoot','tr'].indexOf(tag) !== -1;
        var isContainer = structural || (tag === 'div' && hasBlockChild(el)) || (tagIsBlock && hasBlockChild(el));

        if (isContainer) {
            var inlineDone = hasDirectInlineContent(el);
            if (inlineDone) {
                var directRuns = collectDirectRuns(el, props);
                var onlyPicture = directRuns.indexOf('<w:drawing>') !== -1 && directRuns.indexOf('<w:t') === -1;
                emitPara(directRuns, onlyPicture ? { align: 'center', spacing: { before: 60, after: 100 } } : { spacing: { before: 0, after: 80 } });
            }
            var blockList = ['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'main', 'header', 'footer', 'blockquote', 'table', 'tr', 'td', 'th', 'ul', 'ol', 'hr', 'tbody', 'thead', 'tfoot'];
            for (var ci = 0; ci < el.children.length; ci++) {
                var child = el.children[ci];
                // Phần inline (img, span...) đã nằm trong đoạn ở trên; duyệt lại sẽ nhân đôi ảnh.
                if (inlineDone && blockList.indexOf(child.tagName.toLowerCase()) === -1) continue;
                processEl(child, props);
            }
            return;
        }

        if (tag === 'img' || tag === 'video' || tag === 'audio') {
            emitPara(collectRuns(el, inherited || { b: false, i: false, u: false, c: null, sz: null }), { spacing: { before: 40, after: 80 } });
            return;
        }

        // Khối chỉ chứa ảnh (vd. <div class="hvu-media-item"><img>...</div>): căn giữa cho dễ nhìn.
        if (tag === 'div' && el.querySelector('img') && !el.textContent.replace(/\s+/g, '').length) {
            var picRuns = '';
            for (var pi = 0; pi < el.childNodes.length; pi++) picRuns += collectRuns(el.childNodes[pi], props);
            if (picRuns) emitPara(picRuns, { align: 'center', spacing: { before: 60, after: 100 } });
            return;
        }

        var opts = {};
        var align = cssValue(style, 'text-align');
        if (align === 'center' || align === 'right' || align === 'both' || align === 'left') opts.align = align === 'both' ? 'both' : align;
        if (cls.indexOf('hdr') !== -1) opts.align = 'center';
        var margin = cssValue(style, 'margin-left').match(/([\d.]+)\s*(px|pt|in)?/i);
        if (margin) {
            var marginValue = parseFloat(margin[1]);
            var marginUnit = (margin[2] || 'px').toLowerCase();
            opts.indent = Math.round(marginValue * (marginUnit === 'in' ? 1440 : marginUnit === 'pt' ? 20 : 15));
        }
        if (tag === 'h1') { opts.heading = 1; opts.keepNext = true; }
        else if (tag === 'h2') { opts.heading = 2; opts.keepNext = true; }
        else if (tag === 'h3') { opts.heading = 3; opts.keepNext = true; }

        var isQuestion = cls.indexOf('q') !== -1 || cls.indexOf('q-text') !== -1;
        var isOption = cls.indexOf('o') !== -1 || cls.indexOf('q-opt') !== -1;
        var isSelected = cls.indexOf('s') !== -1 || /#c2185b/i.test(style);
        if (isQuestion) {
            props.b = true;
            opts.shading = colorHex(cssValue(style, 'background-color')) || 'EAF3FF';
            opts.borderLeft = colorHex(cssValue(style, 'border-left')) || '2563EB';
            opts.spacing = { before: 180, after: 80 };
            opts.keepNext = true;
        }
        if (isSelected) {
            props.b = true;
            props.c = 'C2185B';
            opts.shading = opts.shading || 'FFF0F3';
        }
        if (isOption) {
            opts.indent = opts.indent || 480;
            opts.spacing = { before: 20, after: 50 };
        }
        if (cls.indexOf('info') !== -1 || cls.indexOf('subject-info') !== -1) {
            opts.shading = 'EAF3FF';
            opts.spacing = { before: 60, after: 80 };
        }
        if (cls.indexOf('subject-hdr') !== -1) {
            opts.heading = 2;
            opts.keepNext = true;
            opts.pageBreakBefore = true;
            opts.shading = '2563EB';
            props.b = true;
            props.c = 'FFFFFF';
        }
        if (!opts.spacing) opts.spacing = { before: 40, after: 80 };

        var runs = '';
        for (var ri = 0; ri < el.childNodes.length; ri++) runs += collectRuns(el.childNodes[ri], props);
        if (runs || tagIsBlock) emitPara(runs, opts);
        else if (el.childNodes.length) {
            for (var fi = 0; fi < el.childNodes.length; fi++) processEl(el.childNodes[fi], props);
        }
    }

    for (var i = 0; i < body.children.length; i++) processEl(body.children[i], { b: false, i: false, u: false, c: null, sz: null });
    return xml;
}

function _hvuBuildDocx(html, imageMap) {
    var imageCtx = { images: [], srcToRel: Object.create(null), imgIndex: 0, docPrId: 0 };
    var bodyXml = _hvuHtmlToOoxmlBody(html, imageMap, imageCtx);

    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Default Extension="png" ContentType="image/png"/>'
        + '<Default Extension="jpg" ContentType="image/jpeg"/>'
        + '<Default Extension="jpeg" ContentType="image/jpeg"/>'
        + '<Default Extension="gif" ContentType="image/gif"/>'
        + '<Default Extension="bmp" ContentType="image/bmp"/>'
        + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        + '</Types>';

    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        + '</Relationships>';

    var docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        + imageCtx.images.map(function (img) {
            return '<Relationship Id="' + img.relId + '"'
                + ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"'
                + ' Target="media/' + img.fileName + '"/>';
        }).join('')
        + '</Relationships>';

    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"'
        + ' xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main"'
        + ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
        + ' xmlns:mv="urn:schemas-microsoft-com:mac:vml"'
        + ' xmlns:o="urn:schemas-microsoft-com:office:office"'
        + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
        + ' xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"'
        + ' xmlns:v="urn:schemas-microsoft-com:vml"'
        + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
        + ' xmlns:w10="urn:schemas-microsoft-com:office:word"'
        + ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
        + ' xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml">'
        + '<w:body>'
        + bodyXml
        + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
        + '</w:body></w:document>';

    var stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        + '<w:docDefaults><w:rPrDefault><w:rPr>'
        + '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>'
        + '<w:sz w:val="24"/><w:szCs w:val="24"/>'
        + '</w:rPr></w:rPrDefault></w:docDefaults>'
        + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>'
        + '<w:pPr><w:spacing w:before="240" w:after="120"/><w:jc w:val="center"/></w:pPr>'
        + '<w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>'
        + '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>'
        + '<w:pPr><w:spacing w:before="200" w:after="100"/><w:jc w:val="center"/></w:pPr>'
        + '<w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>'
        + '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/>'
        + '<w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr>'
        + '<w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>'
        + '</w:styles>';

    var enc = _hvuStrToUtf8;
    var zipFiles = [
        { name: '[Content_Types].xml', data: enc(contentTypes) },
        { name: '_rels/.rels', data: enc(rels) },
        { name: 'word/_rels/document.xml.rels', data: enc(docRels) },
        { name: 'word/document.xml', data: enc(documentXml) },
        { name: 'word/styles.xml', data: enc(stylesXml) }
    ];

    imageCtx.images.forEach(function (img) {
        zipFiles.push({ name: 'word/media/' + img.fileName, data: img.bytes });
    });

    var zipData = _hvuCreateZip(zipFiles);
    return {
        blob: new Blob([zipData], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
        imageCount: imageCtx.images.length
    };
}

function _hvuSaveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    if (a.parentNode) document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

// Trả về Promise<{ images, total }>: tải hết ảnh rồi mới dựng DOCX để ảnh
// nằm thật trong file thay vì chỉ là nhãn chữ.
function downloadWord(html, filename, options) {
    options = options || {};
    return _hvuLoadImageMap(html, options.onProgress)
        .catch(function () { return Object.create(null); })
        .then(function (imageMap) {
            var built = _hvuBuildDocx(html, imageMap);
            _hvuSaveBlob(built.blob, filename);
            return { images: built.imageCount, total: imageMap ? Object.keys(imageMap).length : 0 };
        });
}


// Export câu hỏi ra workbook XLSX thật (không phải CSV đổi đuôi).
// Mỗi worksheet luôn có 5 cột: câu hỏi + 4 lựa chọn A/B/C/D.
function _hvuExcelPlainValue(value, media) {
    if (value !== null && typeof value !== 'undefined' && String(value).trim() !== '') return String(value);
    if (!media || !media.length) return '';
    return media.map(function (m) {
        if (!m) return '';
        if (m.type === 'image') return '[Hình ảnh]';
        if (m.type === 'video') return '[Video]';
        if (m.type === 'audio') return '[Âm thanh]';
        return '[Tệp đính kèm]';
    }).filter(Boolean).join(' ');
}

function _hvuExcelQuestionCell(q) {
    q = q || {};
    var text = _hvuExcelPlainValue(q.text, null);
    var media = _hvuExcelPlainValue('', q.media);
    if (text && media) return text + ' ' + media;
    return text || media;
}

function _hvuExcelOptionCell(o) {
    if (o && typeof o === 'object') return _hvuExcelPlainValue(o.value, o.media);
    return _hvuExcelPlainValue(o, null);
}

function _hvuExcelSafeSheetName(name, usedNames) {
    var base = String(name || 'Câu hỏi').replace(/[\\/?*\[\]:]/g, ' ').trim().substring(0, 31) || 'Câu hỏi';
    var candidate = base;
    var suffix = 2;
    while (usedNames[candidate.toLowerCase()]) {
        var tail = ' ' + suffix++;
        candidate = base.substring(0, 31 - tail.length) + tail;
    }
    usedNames[candidate.toLowerCase()] = true;
    return candidate;
}

function _hvuExcelCellRef(colIndex, rowIndex) {
    var col = '';
    var n = colIndex + 1;
    while (n > 0) {
        var r = (n - 1) % 26;
        col = String.fromCharCode(65 + r) + col;
        n = Math.floor((n - 1) / 26);
    }
    return col + rowIndex;
}

function _hvuExcelWorksheetXml(questions) {
    var headers = ['NỘI DUNG CÂU HỎI', 'LỰA CHỌN A', 'LỰA CHỌN B', 'LỰA CHỌN C', 'LỰA CHỌN D'];
    // Thêm cột đáp án (1/2/3/4 = A/B/C/D) chỉ khi sheet có câu đã biết đáp án đúng,
    // để file không đổi bố cục với những môn chưa có đáp án.
    var hasAnswers = (questions || []).some(function (q) { return hvuCorrectIndex(q) >= 0; });
    var lastCol = hasAnswers ? 'F' : 'E';
    if (hasAnswers) headers.push('ĐÁP ÁN ĐÚNG');
    var rows = [headers];
    (questions || []).forEach(function (q) {
        q = q || {};
        var options = q.options || [];
        var row = [_hvuExcelQuestionCell(q)];
        for (var i = 0; i < 4; i++) row.push(_hvuExcelOptionCell(options[i]));
        if (hasAnswers) {
            var ci = hvuCorrectIndex(q);
            row.push(ci >= 0 && ci < 4 ? String(ci + 1) : '');
        }
        rows.push(row);
    });

    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<dimension ref="A1:' + lastCol + rows.length + '"/>'
        + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>'
        + '<sheetFormatPr defaultRowHeight="18"/>'
        + '<cols><col min="1" max="1" width="62" customWidth="1"/><col min="2" max="5" width="42" customWidth="1"/>' + (hasAnswers ? '<col min="6" max="6" width="16" customWidth="1"/>' : '') + '</cols>'
        + '<sheetData>';
    rows.forEach(function (row, ri) {
        var rowNo = ri + 1;
        sheet += '<row r="' + rowNo + '"' + (ri === 0 ? ' ht="28" customHeight="1"' : '') + '>';
        row.forEach(function (value, ci) {
            var ref = _hvuExcelCellRef(ci, rowNo);
            var style = ri === 0 ? ' s="1"' : '';
            sheet += '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + _hvuEscXml(value) + '</t></is></c>';
        });
        sheet += '</row>';
    });
    sheet += '</sheetData><autoFilter ref="A1:' + lastCol + rows.length + '"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>';
    return sheet;
}

function downloadExcelWorkbook(sheets, filename) {
    sheets = Array.isArray(sheets) ? sheets : [];
    if (!sheets.length) throw new Error('Không có dữ liệu để xuất Excel.');
    var safeNames = Object.create(null);
    var prepared = sheets.map(function (sheet) {
        sheet = sheet || {};
        return {
            name: _hvuExcelSafeSheetName(sheet.name, safeNames),
            questions: Array.isArray(sheet.questions) ? sheet.questions : []
        };
    });

    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + prepared.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('')
        + '</Types>';
    var packageRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>';
    var workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<bookViews><workbookView/></bookViews><sheets>'
        + prepared.map(function (sh, i) { return '<sheet name="' + _hvuEscXml(sh.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('')
        + '</sheets></workbook>';
    var workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + prepared.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('')
        + '<Relationship Id="rId' + (prepared.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        + '</Relationships>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<fonts count="2"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font></fonts>'
        + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill></fills>'
        + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border></borders>'
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs>'
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

    var files = [
        { name: '[Content_Types].xml', data: _hvuStrToUtf8(contentTypes) },
        { name: '_rels/.rels', data: _hvuStrToUtf8(packageRels) },
        { name: 'xl/workbook.xml', data: _hvuStrToUtf8(workbook) },
        { name: 'xl/_rels/workbook.xml.rels', data: _hvuStrToUtf8(workbookRels) },
        { name: 'xl/styles.xml', data: _hvuStrToUtf8(styles) }
    ];
    prepared.forEach(function (sheet, i) {
        files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: _hvuStrToUtf8(_hvuExcelWorksheetXml(sheet.questions)) });
    });
    var blob = new Blob([_hvuCreateZip(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = null;
    var a = null;
    try {
        url = URL.createObjectURL(blob);
        a = document.createElement('a');
        a.href = url;
        a.download = filename || 'CauHoi_HVU.xlsx';
        document.body.appendChild(a);
        a.click();
    } finally {
        if (a && a.parentNode) document.body.removeChild(a);
        if (url) setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }
}

function downloadExcel(questions, filename, sheetName) {
    downloadExcelWorkbook([{ name: sheetName || 'Câu hỏi', questions: questions || [] }], filename || 'CauHoi_HVU.xlsx');
}


var HVU_SYNC_KEY = 'HVU2025@Sync';
