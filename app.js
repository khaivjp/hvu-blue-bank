(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORAGE_REPO = 'khaidev_github_repo';
  const STORAGE_REMEMBER = 'khaidev_remember_pat_v1';
  const STORAGE_TOKEN = 'khaidev_pat_optin_v1';
  const SESSION_TOKEN = 'khaidev_pat_session_v1';
  const STORAGE_PAGE = 'khaidev_selected_page_v1';
  const CACHE_DB = 'khaidev_bank_cache_v1';
  function fromStorage(storage, key) { try { return storage.getItem(key) || ''; } catch (_) { return ''; } }
  function toStorage(storage, key, value) { try { if (value) storage.setItem(key,value); else storage.removeItem(key); } catch (_) {} }
  const rememberedLongTerm = fromStorage(localStorage, STORAGE_REMEMBER) === 'yes';
  const initialToken = rememberedLongTerm ? fromStorage(localStorage, STORAGE_TOKEN) : fromStorage(sessionStorage, SESSION_TOKEN);
  const DATA_PATH = 'data/hvu-bank.json';
  const rememberedRepo = (() => { try { return localStorage.getItem(STORAGE_REPO) || HVUGitHub.DEFAULT_REPO; } catch (_) { return ''; } })();
  const state = { repo: rememberedRepo, token: initialToken, bank: {}, exportedAt: '', selected: '', visible: 25, search: '', connected: false, busy: false, page: ['quiz','editor'].includes(fromStorage(localStorage,STORAGE_PAGE))?fromStorage(localStorage,STORAGE_PAGE):'bank', cacheSource: '', dirty: false, revision: 0 };
  const repoPattern = /^[a-z\d](?:[a-z\d-]{0,38})\/[\w.-]{1,100}$/i;

  const safe = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fname = val => String(val || 'NganHang').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 65);
  const date = ms => ms ? new Date(ms).toLocaleDateString('vi-VN') : '—';
  const fmt = n => Number(n || 0).toLocaleString('vi-VN');
  const names = () => Object.keys(state.bank).filter(s => state.bank[s] && Array.isArray(state.bank[s].questions)).sort((a,b) => (state.bank[b].lastUpdated || 0) - (state.bank[a].lastUpdated || 0));
  const qs = s => (state.bank[s] && state.bank[s].questions) || [];
  const total = () => names().reduce((sum,s) => sum + qs(s).length, 0);
  const matches = q => !state.search || [q.text, ...(q.options || []).map(o => o && typeof o === 'object' ? o.value : o)].join(' ').toLocaleLowerCase('vi').includes(state.search);

  function openCacheDB() {
    return new Promise((resolve,reject) => {
      if (!window.indexedDB) return reject(Error('IndexedDB không khả dụng'));
      const r=indexedDB.open(CACHE_DB,1);
      r.onupgradeneeded=()=>{ if(!r.result.objectStoreNames.contains('saved')) r.result.createObjectStore('saved'); };
      r.onsuccess=()=>resolve(r.result);
      r.onerror=()=>reject(r.error||Error('Không mở được bộ nhớ'));
    });
  }
  async function bankCache(action, payload){
    const db=await openCacheDB();
    try { return await new Promise((resolve,reject)=>{
      const tx=db.transaction('saved',action==='put'?'readwrite':'readonly');
      const req=tx.objectStore('saved')[action==='put'?'put':'get']( ...(action==='put'?[payload,'latest']:['latest']) );
      tx.oncomplete=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('Bộ nhớ lỗi'));
      tx.onabort=()=>reject(tx.error||Error('Lưu thất bại'));
    }); } finally { db.close(); }
  }
  let cacheQueue = Promise.resolve();
  function saveBankCache(source){
    const payload={source,repo:state.repo,bank:HVUBank.clone(state.bank),exportedAt:state.exportedAt,savedAt:Date.now(),dirty:state.dirty};
    const job=async()=>{
      try {await bankCache('put',payload);toStorage(localStorage,'khaidev_bank_fallback_v1','');return true;}
      catch (_) {
        try {localStorage.setItem('khaidev_bank_fallback_v1',JSON.stringify(payload));return true;}
        catch (_) {notice('Trình duyệt không lưu được bản offline. Hãy dùng nút Sao lưu JSON trước khi đóng trang.',false);return false;}
      }
    };
    cacheQueue=cacheQueue.then(job,job);return cacheQueue;
  }
  async function restoreCache(){
    let c, fallback;
    try {c=await bankCache('get');}catch(_){}
    try {fallback=JSON.parse(fromStorage(localStorage,'khaidev_bank_fallback_v1')||'null');}catch(_){}
    if(fallback&&(!c||(fallback.savedAt||0)>(c.savedAt||0)))c=fallback;
    if (!c || !c.bank || (c.repo && c.repo!==state.repo)) return false;
    try {state.bank=takeBank(c.bank);} catch (_) {return false;}
    state.exportedAt=c.exportedAt||'';state.cacheSource=c.source||'local';state.dirty=!!c.dirty;
    render();notice('Đã khôi phục dữ liệu câu hỏi từ bộ nhớ trên thiết bị. Có thể xem khi chưa kết nối GitHub.',true);
    return true;
  }
  function persistAuth(){
    toStorage(localStorage,STORAGE_REPO,state.repo);
    toStorage(sessionStorage,SESSION_TOKEN,state.token);
    const enabled=$('remember-token').checked;
    toStorage(localStorage,STORAGE_REMEMBER, enabled?'yes':'');
    toStorage(localStorage,STORAGE_TOKEN,enabled?state.token:'');
  }
  function switchPage(page){
    state.page=['quiz','editor'].includes(page)?page:'bank';
    toStorage(localStorage,STORAGE_PAGE,state.page);
    ['bank','quiz','editor'].forEach(name=>$(`${name}-page`).classList.toggle('hidden',state.page!==name));
    $('nav-quiz').classList.toggle('active',state.page==='quiz');
    $('nav-editor').classList.toggle('active',state.page==='editor');
    $('nav-all').classList.toggle('active',state.page==='bank'&&!state.selected);
    $('breadcrumb-page').textContent={bank:'Ngân hàng câu hỏi',quiz:'Chơi Quizizz',editor:'Sửa đáp án đúng'}[state.page];
    document.querySelectorAll('#subject-list .side-item').forEach(el=>el.classList.toggle('active',state.page==='bank'&&el.getAttribute('data-subject')===state.selected));
    document.dispatchEvent(new CustomEvent('hvu:page',{detail:state.page}));
    closeMobile();window.scrollTo({top:0,behavior:'instant'});
  }

  function notice(message, good) {
    const el = $('alert'); el.textContent = message || ''; el.classList.toggle('hidden', !message); el.classList.toggle('ok', !!good);
  }
  function status(value) {
    $('top-connection').innerHTML = '<span class="dot"></span> ' + (value ? 'GitHub đã kết nối' : 'Offline');
    $('sync-label').textContent = value ? 'Đã kết nối' : 'Chưa kết nối';
  }
  function decodeBase64(base64) {
    const raw = atob(base64.replace(/\s/g, ''));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  async function request(url, token) {
    const response = await fetch(url, { headers: Object.assign({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, token ? { Authorization: 'Bearer ' + token } : {}), cache: 'no-store' });
    let data = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 404) throw Error('Không thấy kho dữ liệu hoặc bạn chưa cấp quyền cho token (404).');
      if (response.status === 401) throw Error('Token hết hạn hoặc không hợp lệ (401).');
      if (response.status === 403) throw Error('GitHub từ chối truy cập (403). Hãy kiểm tra quyền và giới hạn API.');
      throw Error('GitHub HTTP ' + response.status + ': ' + String(data?.message || 'Không thể tải dữ liệu'));
    }
    return data;
  }
  async function loadFromGitHub(repo, token) {
    return (await HVUGitHub.read(repo, token)).payload;
  }
  const takeBank = data => HVUBank.normalize(data);
  async function connect(repo, token) {
    if (state.busy) return;
    if (state.dirty && repo !== state.repo) { notice('Hãy đẩy hoặc sao lưu JSON các đáp án đang chờ trước khi đổi repo.', false); return; }
    state.busy = true;
    $('connect').disabled = true;
    notice('Đang tải ngân hàng câu hỏi từ GitHub…', true);
    try {
      const incoming = await loadFromGitHub(repo, token);
      const bank = takeBank(incoming);
      state.bank = state.repo === repo ? HVUBank.merge(bank, state.bank) : bank;
      state.repo = repo; state.token = token;
      state.exportedAt = incoming.exportedAt || '';
      state.selected = ''; state.visible = 25; state.connected = true;
      persistAuth();
      status(true); closeModal(); render();
      loadImageIndex(true).then(hydrateImages);
      await saveBankCache('github');
      notice('Đã tải thành công ' + fmt(total()) + ' câu hỏi từ ' + repo + '.', true);
    } catch (e) {
      notice(e.message || 'Không thể kết nối GitHub.', false);
    } finally {
      state.busy = false;
      $('connect').disabled = false;
    }
  }
  function openModal() {
    $('settings-backdrop').classList.remove('hidden');
    $('repo-input').value = state.repo;
    $('token-input').value = state.token;
    $('remember-token').checked = fromStorage(localStorage,STORAGE_REMEMBER)==='yes';
    setTimeout(() => $('repo-input').focus(), 20);
  }
  function closeModal() { $('settings-backdrop').classList.add('hidden'); }
  // ---------------------------------------------------------------------------
  // Ảnh câu hỏi: link ảnh gốc của LMS cần đăng nhập nên không mở được trên web.
  // Tiện ích đẩy ảnh vào thư mục images/ của repo dữ liệu (images/index.json ghi
  // fileId -> tên file). Repo dữ liệu private nên đọc bằng chính token đã nhập.
  // Tên file là mã băm nội dung, không bao giờ đổi nội dung -> lưu cache lâu dài.
  // ---------------------------------------------------------------------------
  const IMG_INDEX_PATH = 'images/index.json';
  const IMG_INDEX_LOCAL = 'khaidev_img_index_v1';
  const IMG_CACHE = 'khaidev-images-v1';
  const imgState = { index: null, repo: '', fetchedAt: 0, urls: new Map(), loading: null };

  function apiHeaders(accept) {
    return Object.assign({ Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' }, state.token ? { Authorization: 'Bearer ' + state.token } : {});
  }
  async function loadImageIndex(force) {
    if (!state.repo) return {};
    const fresh = imgState.index && imgState.repo === state.repo && (Date.now() - imgState.fetchedAt < 60000);
    if (!force && imgState.index && imgState.repo === state.repo) return imgState.index;
    if (fresh) return imgState.index;
    if (imgState.loading) return imgState.loading;
    imgState.loading = (async () => {
      let files = null;
      try {
        const root = 'https://api.github.com/repos/' + state.repo;
        const info = await request(root + '/contents/' + IMG_INDEX_PATH, state.token);
        const blob = info.content ? info : await request(root + '/git/blobs/' + encodeURIComponent(info.sha), state.token);
        files = (JSON.parse(decodeBase64(blob.content)) || {}).files || {};
        try { localStorage.setItem(IMG_INDEX_LOCAL, JSON.stringify({ repo: state.repo, files })); } catch (_) {}
      } catch (e) {
        // Chưa có images/ (404), mất mạng hoặc token chưa nhập: dùng bản index đã lưu trên máy.
        try { const c = JSON.parse(localStorage.getItem(IMG_INDEX_LOCAL) || 'null'); if (c && c.repo === state.repo) files = c.files; } catch (_) {}
      }
      imgState.index = files || {}; imgState.repo = state.repo; imgState.fetchedAt = Date.now();
      return imgState.index;
    })();
    try { return await imgState.loading; } finally { imgState.loading = null; }
  }
  const mimeOf = name => ({ png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' })[String(name).split('.').pop()] || 'application/octet-stream';
  async function imageBytesByName(name) {
    const key = 'https://khaidev.local/img/' + encodeURIComponent(name);
    try { const c = await caches.open(IMG_CACHE); const hit = await c.match(key); if (hit) return new Uint8Array(await hit.arrayBuffer()); } catch (_) {}
    if (!state.repo) return null;
    const res = await fetch('https://api.github.com/repos/' + state.repo + '/contents/images/' + encodeURIComponent(name), { headers: apiHeaders('application/vnd.github.raw+json') });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    try { const c = await caches.open(IMG_CACHE); await c.put(key, new Response(buf.slice(0), { headers: { 'content-type': mimeOf(name) } })); } catch (_) {}
    return new Uint8Array(buf);
  }
  async function imageNameForSrc(src) {
    const id = _hvuFileIdFromSrc(src);
    if (!id) return '';
    let index = await loadImageIndex(false);
    if (!index[id]) index = await loadImageIndex(true);      // có thể vừa được đẩy lên
    return index[id] || '';
  }
  window.hvuWebImages = {
    bytes: async src => { const name = await imageNameForSrc(src); return name ? imageBytesByName(name) : null; },
    url: async src => {
      const name = await imageNameForSrc(src);
      if (!name) return '';
      if (imgState.urls.has(name)) return imgState.urls.get(name);
      const bytes = await imageBytesByName(name);
      if (!bytes) return '';
      const url = URL.createObjectURL(new Blob([bytes], { type: mimeOf(name) }));
      imgState.urls.set(name, url);
      return url;
    }
  };
  // Gắn ảnh thật vào các thẻ <img data-hvu-src> sau mỗi lần vẽ danh sách.
  function hydrateImages() {
    document.querySelectorAll('img[data-hvu-src]').forEach(img => {
      const src = img.getAttribute('data-hvu-src');
      img.removeAttribute('data-hvu-src');
      window.hvuWebImages.url(src).then(url => {
        if (url) { img.src = url; img.classList.remove('img-wait'); return; }
        const note = document.createElement('div');
        note.className = 'img-missing';
        note.textContent = state.token || state.repo ? 'Ảnh chưa có trên GitHub — mở câu này trên LMS rồi đồng bộ từ tiện ích.' : 'Nhập repo/token để xem ảnh.';
        img.replaceWith(note);
      }).catch(() => { img.classList.remove('img-wait'); });
    });
  }

  function mediaUrl(input) {
    try {
      const url = new URL(String(input), window.location.href);
      return url.protocol === 'https:' ? url.href : '';
    } catch (e) { return ''; }
  }
  function renderMedia(media) {
    if (!Array.isArray(media)) return '';
    const html = media.slice(0,6).map(item => {
      if (!item || typeof item !== 'object') return '';
      const uri = mediaUrl(item.src);
      if (!uri) return '';
      if (item.type === 'image') {
        // Ảnh của LMS (có fileId) lấy từ images/ trên GitHub; ảnh ngoài thì giữ link gốc.
        if (_hvuFileIdFromSrc(item.src)) return '<img class="img-wait" data-hvu-src="' + safe(String(item.src)) + '" alt="Hình minh họa câu hỏi">';
        return '<img loading="lazy" referrerpolicy="no-referrer" src="' + safe(uri) + '" alt="Hình minh họa câu hỏi">';
      }
      return '<a href="' + safe(uri) + '" target="_blank" rel="noopener noreferrer">↗ ' + safe(item.type || 'Tệp đính kèm') + '</a>';
    }).filter(Boolean).join('');
    return html ? '<div class="q-media">' + html + '</div>' : '';
  }
  function renderCard(name) {
    const subj = state.bank[name];
    return '<article class="subject-card" data-select="' + safe(name) + '" tabindex="0" role="button" aria-label="Xem môn ' + safe(name) + '">' +
      '<div class="subject-card-header"><div class="subject-card-icon">▤</div><h3>' + safe(name) + '</h3></div>' +
      '<div class="meta"><span>▦ ' + fmt(qs(name).length) + ' câu hỏi</span><span>◷ ' + date(subj.lastUpdated) + '</span></div>' +
      '<div class="action">Xem ngân hàng câu hỏi <span>→</span></div></article>';
  }
  function renderQuestion(q, i) {
    const right = hvuCorrectIndex(q);   // -1 nếu chưa có đáp án đã xác nhận (chỉ có khi từng đạt 100%)
    const options = (q.options || []).slice(0, 10).map((option,j) => {
      const value = typeof option === 'object' && option !== null ? option.value || '' : option;
      const suffix = typeof option === 'object' && option !== null ? renderMedia(option.media) : '';
      const ok = j === right;
      return '<div class="option' + (ok ? ' correct' : '') + '"><span class="letter">' + String.fromCharCode(65 + j) + '.</span><div>' + safe(value) + suffix + '</div>' + (ok ? '<span class="tick">✓ Đáp án đúng</span>' : '') + '</div>';
    }).join('');
    return '<article class="question"><p class="question-title"><span class="n">Câu ' + (i+1) + ':</span> ' + safe(q.text) + '</p>' + renderMedia(q.media) + '<div class="options">' + options + '</div></article>';
  }
  function render() {
    const all = names();
    const filteredNames = all.filter(n => !state.search || n.toLocaleLowerCase('vi').includes(state.search) || qs(n).some(matches));
    $('side-total').textContent = all.length;
    $('stat-subjects').textContent = fmt(all.length);
    $('stat-source').textContent = state.connected ? 'Đã lưu trên cloud' : 'Bản dữ liệu đang mở';
    $('stat-questions').textContent = fmt(total());
    const last = all.reduce((max,s) => Math.max(max, state.bank[s].lastUpdated || 0), 0);
    $('stat-date').textContent = last ? date(last) : (state.exportedAt ? date(state.exportedAt) : '—');
    $('stat-ago').textContent = state.exportedAt ? 'Bản backup: ' + date(state.exportedAt) : 'Thời gian lưu câu hỏi';
    $('subject-list').innerHTML = all.length ? all.map(n => '<button type="button" class="side-item ' + (state.page==='bank' && state.selected === n ? 'active' : '') + '" data-subject="' + safe(n) + '"><span class="side-icon">▤</span>' + safe(n) + '</button>').join('') : '<div class="side-muted">Chưa có môn</div>';
    $('nav-all').classList.toggle('active', state.page==='bank'&&!state.selected);
    $('section-title').textContent = state.selected || 'Tất cả môn học';
    $('section-subtitle').textContent = state.selected ? 'Danh sách câu hỏi đã lưu của môn học này.' : 'Chọn một môn để xem toàn bộ câu hỏi, hoặc tìm kiếm trong các môn.';
    if (state.selected && !state.bank[state.selected]) state.selected = '';
    $('empty-state').classList.toggle('hidden', all.length > 0);
    $('subject-grid').classList.toggle('hidden', !!state.selected || !all.length);
    $('question-section').classList.toggle('hidden', !state.selected);
    if (!state.selected) {
      $('subject-grid').innerHTML = filteredNames.length ? filteredNames.map(renderCard).join('') : '<div class="side-muted">Không tìm thấy môn phù hợp.</div>';
    } else {
      const questions = qs(state.selected).filter(matches);
      $('question-count').textContent = fmt(questions.length) + ' câu';
      $('question-heading').textContent = 'Danh sách câu hỏi';
      $('question-list').innerHTML = questions.length ? questions.slice(0, state.visible).map((q,i) => renderQuestion(q,i)).join('') : '<div class="side-muted">Không có câu hỏi phù hợp.</div>';
      $('load-more').classList.toggle('hidden', questions.length <= state.visible);
    }
    $('export-word').disabled = !all.length;
    $('export-excel').disabled = !all.length;
    hydrateImages();
    document.dispatchEvent(new CustomEvent('hvu:bank'));
  }
  function choose(name) {
    state.selected = name; state.visible = 25;
    render();switchPage('bank'); document.querySelector('.workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    closeMobile();
  }
  function exportRows() {
    if (state.selected) return [{ name: state.selected, questions: qs(state.selected) }];
    const wanted = names().filter(n => !state.search || n.toLocaleLowerCase('vi').includes(state.search) || qs(n).some(matches));
    return wanted.map(name => ({name, questions: qs(name)}));
  }
  async function downloadDocx() {
    const rows = exportRows();
    if (!rows.length) return notice('Không có câu hỏi để xuất.', false);
    try {
      notice('Đang tạo file Word và nhúng ảnh…', true);
      let result;
      if (rows.length === 1) {
        const row = rows[0];
        result = await downloadWord(generateWordHtml(row.questions, row.name), 'NganHang_' + fname(row.name) + '.docx');
      } else {
        let html = '<html><head><meta charset="UTF-8"></head><body><h1 style="text-align:center">NGÂN HÀNG CÂU HỎI HVU</h1>';
        rows.forEach((row, i) => {
          html += '<h2 style="background:#dbeafe;color:#1d4ed8;margin-top:28px;padding:10px;page-break-before:' + (i ? 'always' : 'auto') + '">' + safe(row.name) + ' (' + row.questions.length + ' câu)</h2>';
          row.questions.forEach((q,j) => {
            const right = hvuCorrectIndex(q);
            html += '<p style="font-weight:bold;margin-top:15px">Câu ' + (j+1) + ': ' + safe(q.text) + '</p>';
            html += renderMediaHtml(q.media, 'word');
            (q.options || []).forEach((o,k) => {
              html += '<p style="margin-left:26px' + (k === right ? ';' + HVU_CORRECT_STYLE : '') + '">' + String.fromCharCode(65+k) + '. ' + safe(typeof o === 'object' && o ? o.value : o) + (k === right ? HVU_CORRECT_MARK : '') + '</p>';
              if (o && typeof o === 'object') html += renderMediaHtml(o.media, 'word');
            });
          });
        });
        result = await downloadWord(html + '</body></html>', 'NganHang_TatCa_' + rows.length + 'mon.docx');
      }
      const missing = result && result.total ? result.total - result.images : 0;
      notice('Đã tạo file Word' + (result && result.total ? ' (nhúng ' + result.images + '/' + result.total + ' ảnh)' : '') + '.' +
        (missing > 0 ? ' ' + missing + ' ảnh chưa có trên GitHub: mở câu đó trên LMS rồi đồng bộ từ tiện ích.' : ''), missing === 0);
    } catch (e) { notice('Xuất Word thất bại: ' + e.message, false); }
  }
  function downloadXlsx() {
    const rows = exportRows().filter(r => r.questions.length);
    if (!rows.length) return notice('Không có câu hỏi để xuất.', false);
    try {
      if (rows.length === 1) downloadExcel(rows[0].questions, 'NganHang_' + fname(rows[0].name) + '.xlsx', rows[0].name);
      else downloadExcelWorkbook(rows, 'NganHang_TatCa_' + rows.length + 'mon.xlsx');
      notice('Đã tạo file Excel (' + rows.length + ' sheet/môn).', true);
    } catch (e) { notice('Xuất Excel thất bại: ' + e.message, false); }
  }
  function showMobile() { $('sidebar').classList.add('open'); $('mobile-overlay').classList.remove('hidden'); }
  function closeMobile() { $('sidebar').classList.remove('open'); $('mobile-overlay').classList.add('hidden'); }
  function bind() {
    $('open-settings').onclick = openModal;
    $('empty-settings').onclick = openModal;
    $('close-settings').onclick = closeModal;
    $('settings-backdrop').addEventListener('click', event => { if (event.target === $('settings-backdrop')) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeMobile(); } });
    $('connect').onclick = () => connect($('repo-input').value.trim(), $('token-input').value.trim());
    $('repo-input').addEventListener('input',event=>toStorage(localStorage,STORAGE_REPO,event.target.value.trim()));
    $('remember-token').addEventListener('change',event=>{
      if (!event.target.checked){toStorage(localStorage,STORAGE_TOKEN,'');toStorage(localStorage,STORAGE_REMEMBER,'');}
    });
    $('nav-quiz').onclick=()=>switchPage('quiz');
    $('nav-editor').onclick=()=>switchPage('editor');
    $('clear-auth').onclick = () => {
      state.token = '';state.connected=false;$('token-input').value = '';$('remember-token').checked=false;
      toStorage(sessionStorage,SESSION_TOKEN,'');toStorage(localStorage,STORAGE_TOKEN,'');toStorage(localStorage,STORAGE_REMEMBER,'');
      status(false);render();notice('Đã xóa token đã lưu. Câu hỏi và đáp án đã lưu offline vẫn được giữ lại.',true);
    };
    $('refresh').onclick = () => { if (!state.repo) openModal(); else connect(state.repo, state.token); };
    $('search').addEventListener('input', event => { state.search = event.target.value.trim().toLocaleLowerCase('vi'); state.visible = 25; render(); });
    $('subject-grid').addEventListener('click', event => { const card = event.target.closest('[data-select]'); if (card) choose(card.getAttribute('data-select')); });
    $('subject-grid').addEventListener('keydown', event => { if (event.key !== 'Enter' && event.key !== ' ') return; const card = event.target.closest('[data-select]'); if (card) { event.preventDefault(); choose(card.getAttribute('data-select')); }});
    $('subject-list').addEventListener('click', event => { const item = event.target.closest('[data-subject]'); if (item) choose(item.getAttribute('data-subject')); });
    $('nav-all').onclick = () => choose('');
    $('load-more').onclick = () => { state.visible += 25; render(); };
    $('export-word').onclick = downloadDocx;
    $('export-excel').onclick = downloadXlsx;
    $('mobile-menu').onclick = showMobile;
    $('mobile-overlay').onclick = closeMobile;
    $('file-input').addEventListener('change', async event => {
      const file = event.target.files?.[0]; if (!file) return;
      try {
        const raw = JSON.parse(await file.text());
        state.bank = HVUBank.merge(takeBank(raw), state.bank); state.dirty=true; state.revision++; state.selected = ''; state.visible = 25;
        state.exportedAt = raw.exportedAt || raw.exportDate || ''; state.connected = false;
        status(false); closeModal(); render(); await saveBankCache('local'); notice('Đã mở và tự lưu file JSON trên thiết bị này (chưa đưa lên GitHub).', true);
      } catch (e) { notice('Không thể mở JSON: ' + e.message, false); }
      event.target.value = '';
    });
  }
  // Keep the open website up to date while the extension commits to GitHub.
  async function pollForUpdates() {
    if (!state.connected || state.busy || document.hidden || state.page==='editor') return;
    state.busy = true;
    try {
      const fresh = await loadFromGitHub(state.repo, state.token);
      if ((fresh.exportedAt || '') !== state.exportedAt) {
        state.bank = HVUBank.merge(takeBank(fresh), state.bank);
        state.exportedAt = fresh.exportedAt || '';
        if (state.selected && !state.bank[state.selected]) state.selected = '';
        render();await saveBankCache('github');
        notice('Có bản cập nhật mới từ GitHub. Ngân hàng câu hỏi đã được làm mới và lưu offline.', true);
      }
    } catch (e) {
      notice('Không thể tự làm mới: ' + String(e.message || e), false);
    } finally { state.busy = false; }
  }
  window.BankApp = { state, safe, names, qs, renderMedia, hydrateImages, notice, render, switchPage, saveBankCache, openModal, status };
  setInterval(pollForUpdates, 90 * 1000);
  bind();render();status(false);switchPage(state.page);
  if (state.repo) $('repo-input').value=state.repo;
  // Khôi phục bản cục bộ trước, sau đó mới tìm bản mới từ GitHub.
  restoreCache().then(() => {
    if (state.repo) connect(state.repo,state.token);
  });
})();
