// Giữ chuẩn Word (.docx) và Excel (.xlsx) từ tiện ích gốc.
function hvuGenerateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function escapeH(t) {
    return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(t) {
    return String(t || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
                    + '<div class="hvu-media-fallback" style="display:none">' + (typeof hvuIcon === 'function' ? hvuIcon('image', 14) : '[IMG]') + ' ' + escapeH(m.src.split('/').pop().substring(0, 40)) + '</div></div>';
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
        (q.options || []).forEach(function (o, j) {
            var val = typeof o === 'object' ? o.value : o;
            var oMedia = typeof o === 'object' ? o.media : null;
            var hasMedia = oMedia && oMedia.length > 0;
            h += '<div class="o">' + String.fromCharCode(65 + j) + '. ' + escapeH(val || (hasMedia ? '' : '—')) + '</div>';
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

function _hvuHtmlToOoxmlBody(html) {
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
            var fname = src.split('/').pop().split('?')[0].substring(0, 60);
            return makeRun('[Hình ảnh' + (fname ? ': ' + fname : '') + ']', { b: false, i: true, u: true, c: '0563C1', sz: props.sz });
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
            if (hasDirectInlineContent(el)) emitPara(collectDirectRuns(el, props), { spacing: { before: 0, after: 80 } });
            for (var ci = 0; ci < el.children.length; ci++) processEl(el.children[ci], props);
            return;
        }

        if (tag === 'img' || tag === 'video' || tag === 'audio') {
            emitPara(collectRuns(el, inherited || { b: false, i: false, u: false, c: null, sz: null }), { spacing: { before: 40, after: 80 } });
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

function _hvuBuildDocx(html) {
    var bodyXml = _hvuHtmlToOoxmlBody(html);

    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
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

    var zipData = _hvuCreateZip(zipFiles);
    return new Blob([zipData], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function downloadWord(html, filename) {
    var url = null;
    var a = null;
    try {
        var blob = _hvuBuildDocx(html);
        url = URL.createObjectURL(blob);
        a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
    } finally {
        if (a && a.parentNode) document.body.removeChild(a);
        if (url) setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }
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
    var rows = [headers];
    (questions || []).forEach(function (q) {
        q = q || {};
        var options = q.options || [];
        var row = [_hvuExcelQuestionCell(q)];
        for (var i = 0; i < 4; i++) row.push(_hvuExcelOptionCell(options[i]));
        rows.push(row);
    });

    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<dimension ref="A1:E' + rows.length + '"/>'
        + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>'
        + '<sheetFormatPr defaultRowHeight="18"/>'
        + '<cols><col min="1" max="1" width="62" customWidth="1"/><col min="2" max="5" width="42" customWidth="1"/></cols>'
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
    sheet += '</sheetData><autoFilter ref="A1:E' + rows.length + '"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>';
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

