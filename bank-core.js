/* Shared data rules for the website, extension and service worker. No credentials. */
(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const norm = value => String(value == null ? '' : value).normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
  const valueOf = option => option && typeof option === 'object' ? String(option.value || '') : String(option == null ? '' : option);
  const optionKey = option => JSON.stringify([norm(valueOf(option)), (option?.media || []).map(m => [m.type || '', m.src || ''])]);
  const questionKey = q => q.qId != null && q.qId !== '' ? 'id:' + q.qId : 'text:' + signature(q);
  const signature = q => JSON.stringify([norm(q.text), (q.media || []).map(m => [m.type, m.src]), (q.options || []).map(optionKey).sort()]);
  function normalize(data) {
    const raw = data?.bank || data;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Dữ liệu không phải ngân hàng câu hỏi.');
    const bank = Object.create(null);
    for (const [name, subject] of Object.entries(raw)) {
      if (['__proto__', 'constructor', 'prototype'].includes(name)) continue;
      if (!subject || !Array.isArray(subject.questions)) continue;
      bank[name] = clone(subject);
      bank[name].questions = subject.questions.filter(q => q && typeof q.text === 'string').map(q => ({
        ...clone(q), options: Array.isArray(q.options) ? clone(q.options) : [], media: Array.isArray(q.media) ? clone(q.media) : []
      }));
    }
    if (Object.keys(raw).length && !Object.keys(bank).length) throw Error('Không tìm thấy môn học hợp lệ trong dữ liệu.');
    return bank;
  }
  function correctIndex(q) {
    if (!q || !Array.isArray(q.options) || q.answerCleared === true) return -1;
    const opts = q.options;
    if (q.correctOptionKey) {
      const hits = opts.map((o, i) => optionKey(o) === q.correctOptionKey ? i : -1).filter(i => i >= 0);
      if (hits.length === 1) return hits[0];
    }
    if (q.correctId !== undefined && q.correctId !== null && q.correctId !== '') {
      const i = opts.findIndex(o => o && typeof o === 'object' && o.id != null && String(o.id) === String(q.correctId));
      if (i >= 0) return i;
    }
    const want = norm(q.correctAnswer);
    if (want) {
      const hits = opts.map((o, i) => norm(valueOf(o)) === want ? i : -1).filter(i => i >= 0);
      if (hits.length === 1) return hits[0];
    }
    return Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < opts.length ? q.correctIndex : -1;
  }
  function setAnswer(question, index, now = Date.now()) {
    if (!Number.isInteger(index) || index < -1 || index >= question.options.length) throw Error('Đáp án được chọn không hợp lệ.');
    const q = clone(question), option = q.options[index];
    q.correctId = index < 0 || option?.id == null ? '' : String(option.id);
    q.correctAnswer = index < 0 ? '' : valueOf(option);
    q.correctIndex = index;
    q.correctOptionKey = index < 0 ? '' : optionKey(option);
    q.answerCleared = index < 0;
    q.answerSource = 'manual';
    q.answerEditedAt = Math.max(now, (Number(q.answerEditedAt) || 0) + 1);
    q.answerVerifiedAt = q.answerEditedAt;
    return q;
  }
  const answerFields = ['correctId', 'correctAnswer', 'correctIndex', 'correctOptionKey', 'answerCleared', 'answerSource', 'answerEditedAt', 'answerVerifiedAt'];
  function mergeQuestion(remote, local) {
    const merged = { ...clone(local), ...clone(remote) };
    // Explicit human corrections (including clearing a bad answer) outlive later LMS captures.
    const manual = q => q.answerSource === 'manual' || Number(q.answerEditedAt) > 0;
    const stamp = q => Number(q.answerEditedAt) || Number(q.answerVerifiedAt) || 0;
    const has = q => manual(q) || correctIndex(q) >= 0;
    let winner = remote;
    if (!has(remote) && has(local)) winner = local;
    else if (has(local) && (manual(local) && !manual(remote) || manual(local) === manual(remote) && stamp(local) > stamp(remote))) winner = local;
    answerFields.forEach(key => { delete merged[key]; if (winner[key] !== undefined) merged[key] = clone(winner[key]); });
    const index = correctIndex(winner);
    if (index >= 0) {
      const source = winner.options[index];
      const keys = merged.options.map(optionKey), key = optionKey(source);
      let mapped = keys.filter(k => k === key).length === 1 ? keys.indexOf(key) : -1;
      if (mapped < 0 && String(remote.qId || '') === String(local.qId || '') && source?.id != null) {
        mapped = merged.options.findIndex(o => o?.id != null && String(o.id) === String(source.id));
      }
      if (mapped < 0 && JSON.stringify(merged.options) === JSON.stringify(winner.options)) mapped = index;
      if (mapped >= 0) {
        const option = merged.options[mapped];
        merged.correctIndex = mapped;
        merged.correctId = option?.id == null ? '' : String(option.id);
        merged.correctAnswer = valueOf(option);
        merged.correctOptionKey = optionKey(option);
      } else {
        merged.correctId = ''; merged.correctAnswer = ''; merged.correctIndex = -1; merged.correctOptionKey = ''; merged.answerCleared = true;
      }
    }
    return merged;
  }
  function merge(remoteInput, localInput) {
    const remote = normalize(remoteInput), local = normalize(localInput), bank = Object.create(null);
    for (const name of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const r = remote[name], l = local[name];
      if (!r || !l) { bank[name] = clone(r || l); continue; }
      const questions = [], byId = new Map(), byContent = new Map();
      const add = q => {
        const id = questionKey(q), content = signature(q);
        const at = byId.has(id) ? byId.get(id) : byContent.get(content);
        if (at !== undefined) questions[at] = mergeQuestion(questions[at], q);
        else questions.push(clone(q));
        const index = at === undefined ? questions.length - 1 : at;
        byId.set(id, index); byContent.set(content, index);
      };
      r.questions.forEach(add); l.questions.forEach(add);
      bank[name] = { ...clone(l), ...clone(r), questions,
        lastUpdated: Math.max(Number(r.lastUpdated) || 0, Number(l.lastUpdated) || 0),
        examCount: Math.max(Number(r.examCount) || 0, Number(l.examCount) || 0),
        seenTestIds: [...new Set([...(r.seenTestIds || []), ...(l.seenTestIds || [])])] };
    }
    return bank;
  }
  function shuffle(items, random = Math.random) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }
  function makeQuiz(questions, config = {}, random = Math.random) {
    let items = questions.filter(q => q.options?.length >= 2).map(q => ({ question: clone(q), right: correctIndex(q), chosen: null,
      options: q.options.map((option, originalIndex) => ({ option: clone(option), originalIndex })) }));
    if (config.shuffleQuestions) items = shuffle(items, random);
    if (config.limit > 0) items = items.slice(0, config.limit);
    if (config.shuffleOptions) items.forEach(item => { item.options = shuffle(item.options, random); });
    return items;
  }
  function score(items) {
    return items.reduce((s, item) => {
      if (item.chosen === null) s.unanswered++;
      if (item.right < 0) s.unknown++;
      else { s.known++; if (item.chosen === item.right) s.correct++; else if (item.chosen !== null) s.wrong++; }
      return s;
    }, { total: items.length, known: 0, correct: 0, wrong: 0, unknown: 0, unanswered: 0 });
  }
  root.HVUBank = { normalize, merge, mergeQuestion, correctIndex, setAnswer, questionKey, optionKey, valueOf, clone, makeQuiz, score };
})(globalThis);
