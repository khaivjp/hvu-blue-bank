/* GitHub Contents API: merge before every conditional write, including retries. */
(function (root) {
  'use strict';
  const DATA_PATH = 'data/hvu-bank.json';
  const DEFAULT_REPO = 'khaivjp/hvu-question-data';
  const validRepo = repo => /^[a-z\d](?:[a-z\d-]{0,38})\/[\w.-]{1,100}$/i.test(repo);
  const base = repo => {
    if (!validRepo(repo)) throw Error('Repository cần theo dạng username/repository.');
    return 'https://api.github.com/repos/' + repo;
  };
  async function api(url, token, options = {}) {
    const response = await fetch(url, { ...options, cache: 'no-store', headers: {
      Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(options.headers || {})
    }, signal: AbortSignal.timeout(60000) });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const hints = {401:'Token không hợp lệ hoặc đã hết hạn.',403:'Kiểm tra quyền token và giới hạn GitHub API.',404:'Không thấy repo/file hoặc token chưa được cấp quyền.',409:'Dữ liệu vừa thay đổi trên GitHub.',422:'GitHub chưa chấp nhận bản ghi.'};
      const error = Error('GitHub ' + response.status + ': ' + (hints[response.status] || body?.message || 'Không thể kết nối.'));
      error.status = response.status; throw error;
    }
    return body;
  }
  function decode(content) { return new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g, '')), c => c.charCodeAt(0))); }
  function encode(text) {
    const bytes = new TextEncoder().encode(text); let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }
  async function read(repo, token, allowMissing = false) {
    const rootUrl = base(repo); let info;
    try { info = await api(rootUrl + '/contents/' + DATA_PATH, token); }
    catch (e) {
      if (!allowMissing || e.status !== 404) throw e;
      await api(rootUrl, token); // A hidden/unavailable repo must not be mistaken for an empty bank.
      return { bank: Object.create(null), payload: {}, sha: null };
    }
    if (info.type !== 'file' || !info.sha) throw Error('Đường dẫn ngân hàng không phải file hợp lệ.');
    const blob = info.content ? info : await api(rootUrl + '/git/blobs/' + encodeURIComponent(info.sha), token);
    if (typeof blob.content !== 'string' || blob.encoding !== 'base64') throw Error('GitHub không trả nội dung file Base64.');
    const payload = JSON.parse(decode(blob.content));
    return { bank: HVUBank.normalize(payload), payload, sha: info.sha };
  }
  async function push(repo, token, getLocal) {
    if (!token) throw Error('Cần token có quyền Contents: Read and write để đẩy dữ liệu.');
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await read(repo, token, true);
      const local = typeof getLocal === 'function' ? await getLocal() : getLocal;
      const bank = HVUBank.merge(current.bank, local);
      const count = Object.values(bank).reduce((sum, s) => sum + s.questions.length, 0);
      if (!count && !Object.values(bank).some(s => s.deletedAt || s.deletedQuestions?.length)) throw Error('Ngân hàng đang trống. Chưa có dữ liệu để đẩy.');
      const payload = { schemaVersion: 1, exportedAt: new Date().toISOString(), source: 'KHAIDEV HVU Blue Bank v4.6', bank };
      const body = { message: 'bank: đồng bộ ' + count + ' câu hỏi và đáp án', content: encode(JSON.stringify(payload)) };
      if (current.sha) body.sha = current.sha;
      try {
        const result = await api(base(repo) + '/contents/' + DATA_PATH, token, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
        if (!result?.content?.sha || !result?.commit?.sha) throw Error('GitHub chưa xác nhận commit dữ liệu.');
        return { bank, payload, sha: result.content.sha, commit: result.commit.sha, count };
      } catch (e) { if (![409,422].includes(e.status) || attempt === 2) throw e; }
    }
  }
  root.HVUGitHub = { DATA_PATH, DEFAULT_REPO, validRepo, read, push };
})(globalThis);
