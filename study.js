(() => {
  'use strict';
  const A = window.BankApp, C = window.HVUBank, $ = id => document.getElementById(id), safe = A.safe;
  let quiz = null, quizIndex = 0, submitted = false, editVisible = 20, pushTimer = null;
  const drafts = new Map();
  const label = index => String.fromCharCode(65 + index);
  const draftKey = (subject, q) => JSON.stringify([subject, C.questionKey(q)]);
  const optionContent = option => safe(C.valueOf(option)) + A.renderMedia(option?.media);
  function populateSubjects(id) {
    const el = $(id), before = el.value, names = A.names();
    el.innerHTML = names.length ? names.map(n => `<option value="${safe(n)}">${safe(n)} (${A.qs(n).length} câu)</option>`).join('') : '<option value="">Chưa có dữ liệu môn học</option>';
    if (names.includes(before)) el.value = before;
    else if (names.includes(A.state.selected)) el.value = A.state.selected;
  }
  function setupInfo() {
    const all = A.qs($('quiz-subject').value), playable = all.filter(q => q.options.length >= 2);
    const known = playable.filter(q => C.correctIndex(q) >= 0).length;
    $('quiz-start').disabled = !playable.length;
    $('quiz-info').textContent = playable.length ? `${playable.length} câu có thể chơi · ${known} câu đã có đáp án. ${playable.length - known} câu chưa có đáp án sẽ không tính điểm.` + (all.length > playable.length ? ` Bỏ qua ${all.length-playable.length} câu chưa đủ lựa chọn.` : '') : 'Chưa có câu hỏi đủ lựa chọn. Hãy tải dữ liệu ở Ngân hàng câu hỏi.';
  }
  function startQuiz() {
    const subject = $('quiz-subject').value;
    const items = C.makeQuiz(A.qs(subject), { shuffleQuestions:$('shuffle-questions').checked, shuffleOptions:$('shuffle-options').checked, limit:Number($('quiz-limit').value) });
    if (!items.length) return;
    quiz = {subject, items}; quizIndex = 0; submitted = false;
    $('quiz-setup').classList.add('hidden'); $('quiz-result').classList.add('hidden'); $('quiz-session').classList.remove('hidden');
    drawQuiz(); $('quiz-question').focus();
  }
  function drawQuiz() {
    const item = quiz.items[quizIndex], answered = quiz.items.filter(q => q.chosen !== null).length;
    $('quiz-title').textContent = quiz.subject;
    $('quiz-progress').textContent = `Câu ${quizIndex + 1}/${quiz.items.length} · Đã trả lời ${answered}/${quiz.items.length}`;
    $('quiz-numbers').innerHTML = quiz.items.map((q, i) => `<button type="button" data-jump="${i}" class="quiz-number${i===quizIndex?' current':''}${q.chosen!==null?' answered':''}" aria-label="Câu ${i+1}${q.chosen!==null?', đã trả lời':''}" ${i===quizIndex?'aria-current="step"':''}>${i+1}</button>`).join('');
    // Correct answers never appear in the active quiz DOM. Choices retain their original index.
    $('quiz-question').innerHTML = `<p class="question-title"><span class="n">Câu ${quizIndex+1}:</span> ${safe(item.question.text)}</p>${A.renderMedia(item.question.media)}<fieldset class="quiz-options"><legend class="sr-only">Chọn một đáp án</legend>${item.options.map(({option,originalIndex},i) => `<label class="quiz-choice${item.chosen===originalIndex?' selected':''}"><input type="radio" name="quiz-answer" value="${originalIndex}" ${item.chosen===originalIndex?'checked':''}><span class="choice-letter">${label(i)}</span><span class="choice-content">${optionContent(option)}</span></label>`).join('')}</fieldset><button class="btn btn-outline" id="quiz-clear" type="button" ${item.chosen===null?'disabled':''}>Bỏ lựa chọn</button>`;
    $('quiz-prev').disabled = quizIndex===0; $('quiz-next').disabled = quizIndex===quiz.items.length-1;
    A.hydrateImages();
  }
  function finishQuiz() {
    if (!quiz || submitted) return;
    const stats = C.score(quiz.items);
    if (stats.unanswered && !confirm(`Bạn còn ${stats.unanswered} câu chưa trả lời. Nộp bài và xem đáp án?`)) return;
    submitted = true;
    const percent = stats.known ? Math.round(stats.correct/stats.known*100) : null;
    $('quiz-session').classList.add('hidden'); $('quiz-result').classList.remove('hidden');
    $('quiz-result').innerHTML = `<div class="result-hero"><span class="section-eyebrow">ĐÃ HOÀN THÀNH · ${safe(quiz.subject)}</span><h2>${percent===null?'Chưa thể chấm điểm':`${stats.correct}/${stats.known} câu đúng`}</h2><p>${percent===null?'Các câu trong lượt này chưa có đáp án đúng được lưu.':`${percent}% trên ${stats.known} câu có đáp án`}</p><div class="result-metrics"><span><b>${stats.wrong}</b> Sai</span><span><b>${stats.unanswered}</b> Bỏ trống</span><span><b>${stats.unknown}</b> Chưa có đáp án</span></div><div class="quiz-controls"><button class="btn btn-primary" id="quiz-again" type="button">Chơi lại môn này</button><button class="btn btn-outline" id="quiz-choose" type="button">Chọn môn khác</button></div></div><h2 class="review-title">Đáp án & bài làm của bạn</h2><div class="question-list">${quiz.items.map((item,index)=>{
      const kind = item.right<0?'unknown':item.chosen===item.right?'right':'wrong';
      const status = item.right<0?'Chưa có đáp án — không tính điểm':item.chosen===null?'Bỏ trống':kind==='right'?'Trả lời đúng':'Trả lời sai';
      return `<article class="question"><span class="answer-badge ${kind}">${status}</span><p class="question-title"><span class="n">Câu ${index+1}:</span> ${safe(item.question.text)}</p>${A.renderMedia(item.question.media)}<div class="options">${item.options.map(({option,originalIndex},i)=>`<div class="option${originalIndex===item.right?' correct':''}${originalIndex===item.chosen&&item.right>=0&&originalIndex!==item.right?' incorrect':''}"><span class="letter">${label(i)}.</span><div class="choice-content">${optionContent(option)}<div class="answer-caption">${originalIndex===item.right?'✓ Đáp án đúng ':''}${originalIndex===item.chosen?'• Bạn đã chọn':''}</div></div></div>`).join('')}</div></article>`;
    }).join('')}</div>`;
    A.hydrateImages(); $('quiz-result').focus(); $('quiz-result').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function resetQuiz() {
    if (quiz && !submitted && !confirm('Kết thúc lượt đang chơi để chọn lại môn?')) return;
    quiz = null; submitted = false;
    $('quiz-setup').classList.remove('hidden'); $('quiz-session').classList.add('hidden'); $('quiz-result').classList.add('hidden'); setupInfo();
  }
  function renderSync() {
    $('edit-sync-state').textContent = A.state.dirty ? 'Có thay đổi đang chờ đẩy lên GitHub' : 'Không có thay đổi đang chờ đẩy';
    $('edit-sync-state').classList.toggle('pending', A.state.dirty);
    $('push-data').disabled = A.state.busy || !A.names().length;
    $('download-json').disabled = !A.names().length;
  }
  function renderEditor() {
    const subject = $('edit-subject').value, search = $('edit-search').value.trim().toLocaleLowerCase('vi');
    const rows = A.qs(subject).map((q,index)=>({q,index})).filter(({q})=>!search || [q.text,...q.options.map(C.valueOf)].join(' ').toLocaleLowerCase('vi').includes(search));
    $('edit-count').textContent = `${rows.length} câu hỏi · Chọn “Chưa xác định” để bỏ đáp án sai. Các thay đổi được lưu riêng theo từng câu.`;
    $('edit-list').innerHTML = rows.length ? rows.slice(0,editVisible).map(({q,index})=>{
      const key=draftKey(subject,q), selected=drafts.has(key)?drafts.get(key):C.correctIndex(q);
      return `<article class="question edit-card" data-question="${index}"><p class="question-title"><span class="n">Câu ${index+1}:</span> ${safe(q.text)}</p>${A.renderMedia(q.media)}<fieldset class="edit-options"><legend>Đáp án đúng</legend>${q.options.map((option,i)=>`<label class="edit-option"><input type="radio" name="edit-${index}" value="${i}" ${i===selected?'checked':''}><span class="letter">${label(i)}.</span><span class="choice-content">${optionContent(option)}</span></label>`).join('')}<label class="edit-option unknown-choice"><input type="radio" name="edit-${index}" value="-1" ${selected<0?'checked':''}> Chưa xác định đáp án đúng</label></fieldset><div class="edit-actions"><span class="study-note">${drafts.has(key)?'Có lựa chọn chưa lưu':q.answerSource==='manual'?'Đã sửa thủ công':C.correctIndex(q)>=0?'Đã có đáp án':'Chưa có đáp án'}</span><button class="btn btn-primary" data-save-answer="${index}" type="button">Lưu đáp án</button></div></article>`;
    }).join('') : '<div class="empty"><h3>Chưa có câu hỏi phù hợp</h3><p>Chọn môn học khác hoặc tải dữ liệu từ GitHub.</p></div>';
    $('edit-more').classList.toggle('hidden', rows.length<=editVisible); A.hydrateImages(); renderSync();
  }
  async function saveAnswer(index, button) {
    const subject=$('edit-subject').value, q=A.qs(subject)[index]; if(!q) return;
    const key=draftKey(subject,q), selected=button.closest('.edit-card').querySelector('input:checked');
    if(!selected) return;
    A.state.bank[subject].questions[index]=C.setAnswer(q,Number(selected.value));
    A.state.bank[subject].lastUpdated=Date.now(); A.state.dirty=true; A.state.revision++;
    drafts.delete(key); button.disabled=true;
    const cached=await A.saveBankCache('local'); A.render(); renderEditor();
    A.notice((cached?'Đã lưu đáp án trên thiết bị. ':'Không lưu được offline. Hãy sao lưu JSON trước khi đóng trang. ')+($('auto-push').checked&&A.state.token?'Đang chuẩn bị đẩy lên GitHub…':'Bấm “Đẩy dữ liệu lên” để cập nhật bản chung.'),true);
    if($('auto-push').checked&&A.state.token) { clearTimeout(pushTimer); pushTimer=setTimeout(()=>pushData(false),700); }
  }
  async function pushData(manual=true) {
    clearTimeout(pushTimer);
    if(A.state.busy) { if(!manual) pushTimer=setTimeout(()=>pushData(false),1200); return; }
    if(!A.state.token) { A.notice('Đáp án vẫn được giữ trên máy. Nhập token có quyền ghi, tải dữ liệu rồi bấm Đẩy dữ liệu lên.',false); if(manual) A.openModal(); return; }
    A.state.busy=true; renderSync(); A.notice('Đang gộp dữ liệu và đẩy đáp án lên GitHub…',true);
    const revision=A.state.revision;
    try {
      const result=await HVUGitHub.push(A.state.repo,A.state.token,()=>A.state.bank);
      A.state.bank=C.merge(result.bank,A.state.bank); A.state.exportedAt=result.payload.exportedAt;
      A.state.dirty=A.state.revision!==revision; A.state.connected=true;
      await A.saveBankCache('github'); A.status(true); A.render();
      A.notice('Đã đẩy dữ liệu lên GitHub. Mở tiện ích → Đồng bộ → Lấy dữ liệu từ DATA để nhận đáp án mới.',true);
      if(A.state.dirty&&$('auto-push').checked) pushTimer=setTimeout(()=>pushData(false),1000);
    } catch(e) { A.notice('Chưa đẩy được: '+e.message+' Các thay đổi vẫn được giữ trên máy; có thể thử lại hoặc sao lưu JSON.',false); }
    finally { A.state.busy=false; renderSync(); }
  }
  function downloadJson() {
    const blob=new Blob([JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),source:'KHAIDEV web',bank:A.state.bank},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download='HVU_Bank_'+new Date().toISOString().slice(0,10)+'.json'; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  $('quiz-subject').onchange=setupInfo; $('quiz-start').onclick=startQuiz;
  $('quiz-prev').onclick=()=>{if(quizIndex>0){quizIndex--;drawQuiz();}};
  $('quiz-next').onclick=()=>{if(quizIndex<quiz.items.length-1){quizIndex++;drawQuiz();}};
  $('quiz-numbers').onclick=e=>{const btn=e.target.closest('[data-jump]');if(btn){quizIndex=Number(btn.dataset.jump);drawQuiz();}};
  $('quiz-question').onchange=e=>{
    if(e.target.name!=='quiz-answer'||submitted) return;
    quiz.items[quizIndex].chosen=Number(e.target.value);
    // Preserve focus on the radio input after choosing with a keyboard.
    $('quiz-question').querySelectorAll('.quiz-choice').forEach(el=>el.classList.toggle('selected',el.contains(e.target)));
    $('quiz-clear').disabled=false;
    $('quiz-progress').textContent=`Câu ${quizIndex+1}/${quiz.items.length} · Đã trả lời ${quiz.items.filter(q=>q.chosen!==null).length}/${quiz.items.length}`;
    $('quiz-numbers').querySelector(`[data-jump="${quizIndex}"]`).classList.add('answered');
  };
  $('quiz-question').onclick=e=>{if(e.target.id==='quiz-clear'){quiz.items[quizIndex].chosen=null;drawQuiz();}};
  $('quiz-submit').onclick=finishQuiz; $('quiz-exit').onclick=resetQuiz;
  $('quiz-result').onclick=e=>{if(e.target.id==='quiz-again') startQuiz();if(e.target.id==='quiz-choose')resetQuiz();};
  $('edit-subject').onchange=()=>{editVisible=20;renderEditor();};
  $('edit-search').oninput=()=>{editVisible=20;renderEditor();};
  $('edit-more').onclick=()=>{editVisible+=20;renderEditor();};
  $('edit-list').onchange=e=>{const card=e.target.closest('[data-question]');if(!card)return;const subject=$('edit-subject').value;drafts.set(draftKey(subject,A.qs(subject)[Number(card.dataset.question)]),Number(e.target.value));card.querySelector('.edit-actions .study-note').textContent='Có lựa chọn chưa lưu';};
  $('edit-list').onclick=e=>{const btn=e.target.closest('[data-save-answer]');if(btn)saveAnswer(Number(btn.dataset.saveAnswer),btn);};
  $('push-data').onclick=()=>pushData(true); $('download-json').onclick=downloadJson;
  try { $('auto-push').checked=localStorage.getItem('hvu_auto_push')!=='off'; } catch(_) {}
  $('auto-push').onchange=()=>{try{localStorage.setItem('hvu_auto_push',$('auto-push').checked?'on':'off');}catch(_){}if(!$('auto-push').checked)clearTimeout(pushTimer);};
  function refresh() {populateSubjects('quiz-subject');populateSubjects('edit-subject');setupInfo();if(A.state.page==='editor')renderEditor();else renderSync();}
  document.addEventListener('hvu:bank',refresh);
  document.addEventListener('hvu:page',e=>{if(e.detail==='editor')renderEditor();if(e.detail==='quiz')setupInfo();});
  window.addEventListener('beforeunload',e=>{if(drafts.size){e.preventDefault();e.returnValue='';}});
  refresh();
})();
