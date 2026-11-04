/* GPA độc lập ngân hàng câu hỏi - dữ liệu chỉ lưu trên thiết bị. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const KEY = 'khaidev_gpa_v1';
  const clean = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const empty = () => ({id: Math.random().toString(36).slice(2) + Date.now().toString(36), name:'', credits:'', process:'', exam:''});
  const baseline = () => ({version:1, weightProcess:'0,5', weightExam:'0,5', rows:[empty(),empty(),empty()]});
  let gpa;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    gpa = saved && Array.isArray(saved.rows) && saved.rows.length && saved.rows.length <= 500
      ? {version:1, weightProcess:String(saved.weightProcess ?? '0,5'), weightExam:String(saved.weightExam ?? '0,5'),
        rows:saved.rows.map(r => ({id:String(r.id || empty().id), name:String(r.name || '').slice(0,300),credits:String(r.credits || '').slice(0,10),process:String(r.process || '').slice(0,12),exam:String(r.exam || '').slice(0,12)}))}
      : baseline();
  } catch (_) { gpa = baseline(); }
  const readNumber = str => {
    const s = String(str ?? '').trim().replace(',', '.');
    if (!s || !/^(?:\d+)(?:\.\d{1,3})?$/.test(s)) return null;
    const n = Number(s); return Number.isFinite(n) ? n : null;
  };
  const grade = s => {const v=readNumber(s); return v !== null && v>=0 && v<=10 ? v : null;};
  const cr = s => {const v=readNumber(s); return v !== null && Number.isInteger(v) && v>=1 && v<=60 ? v : null;};
  const fmt = (value, digits=2) => value == null ? '—' : Number(value.toFixed(digits)).toLocaleString('vi-VN',{maximumFractionDigits:digits});
  const weightSumValid = () => {
    const a=readNumber(gpa.weightProcess), b=readNumber(gpa.weightExam);
    return a!==null && b!==null && a>=0 && b>=0 && a<=1 && b<=1 && Math.abs(a+b-1)<0.000001;
  };
  const points = row => {
    if (!weightSumValid()) return null;
    const a=grade(row.process), b=grade(row.exam);
    if (a===null || b===null) return null;
    return a*readNumber(gpa.weightProcess)+b*readNumber(gpa.weightExam);
  };
  function calculate(){
    let credits=0, weighted=0;
    const per={};
    for (const row of gpa.rows){
      const score=points(row), c=cr(row.credits);
      per[row.id] = {score, four: score===null?null:score*.4};
      if (c!==null && score!==null){credits += c;weighted += score*c;}
    }
    return {credits, ten: credits?weighted/credits:null, four:credits?weighted/credits*.4:null, per};
  }
  function store(){
    try {localStorage.setItem(KEY,JSON.stringify(gpa)); $('gpa-save-status').textContent='✓ Đã tự lưu trên thiết bị'; $('gpa-save-status').classList.remove('save-error');}
    catch(e){$('gpa-save-status').textContent='⚠ Lỗi lưu: hãy xuất CSV';$('gpa-save-status').classList.add('save-error');}
  }
  const entry = (row,i) => `<tr data-id="${clean(row.id)}">
    <td class="gpa-num">${i+1}</td>
    <td class="gpa-name"><input data-field="name" value="${clean(row.name)}" placeholder="Nhập tên môn học..." aria-label="Tên môn thứ ${i+1}"></td>
    <td><input class="gpa-short" data-field="credits" inputmode="numeric" value="${clean(row.credits)}" placeholder="TC" aria-label="Số tín chỉ môn thứ ${i+1}"></td>
    ${i===0 ? `<td class="gpa-merged" rowspan="${gpa.rows.length}"><strong id="gpa-credits-merged">0</strong><small>Tín chỉ</small></td>`:''}
    <td><input class="gpa-short" data-field="process" inputmode="decimal" value="${clean(row.process)}" placeholder="0,0 - 10" aria-label="Điểm thành phần môn thứ ${i+1}"></td>
    <td><input class="gpa-short" data-field="exam" inputmode="decimal" value="${clean(row.exam)}" placeholder="0,0 - 10" aria-label="Điểm thi môn thứ ${i+1}"></td>
    <td class="gpa-result" data-result="total">—</td><td class="gpa-result gpa-result-four" data-result="four">—</td>
    ${i===0 ? `<td class="gpa-merged merged-four" rowspan="${gpa.rows.length}"><strong id="gpa-four-merged">—</strong><small>Hệ 4</small></td><td class="gpa-merged merged-ten" rowspan="${gpa.rows.length}"><strong id="gpa-ten-merged">—</strong><small>Hệ 10</small></td>`:''}
    <td><button type="button" class="gpa-delete" data-delete="${clean(row.id)}" aria-label="Xóa môn thứ ${i+1}" title="Xóa môn">✕</button></td>
  </tr>`;
  const mobileEntry = (row,i) => `<article class="gpa-mobile-card" data-id="${clean(row.id)}">
    <div class="gpa-mobile-card-head"><strong>Môn ${i+1}</strong><button class="gpa-delete" type="button" data-delete="${clean(row.id)}" aria-label="Xóa môn ${i+1}">Xóa ×</button></div>
    <label class="gpa-mobile-name">Tên môn học<input data-field="name" value="${clean(row.name)}" placeholder="Ví dụ: INT343 Quản lý HTMT"></label>
    <div class="gpa-mobile-fields">
      <label>Số tín chỉ<input data-field="credits" inputmode="numeric" value="${clean(row.credits)}" placeholder="3"></label>
      <label>Điểm thành phần<input data-field="process" inputmode="decimal" value="${clean(row.process)}" placeholder="0,0 - 10"></label>
      <label>Điểm thi KTHP<input data-field="exam" inputmode="decimal" value="${clean(row.exam)}" placeholder="0,0 - 10"></label>
    </div>
    <div class="gpa-mobile-results"><span>Điểm tổng hệ 10 <strong data-result="total">—</strong></span><span>GPA môn hệ 4 <strong data-result="four">—</strong></span></div>
  </article>`;
  function updateResults(){
    const totals=calculate();
    $('gpa-credits').textContent=totals.credits;
    $('gpa-four').textContent=fmt(totals.four);
    $('gpa-ten').textContent=fmt(totals.ten);
    $('gpa-credits-merged').textContent=totals.credits;
    $('gpa-four-merged').textContent=fmt(totals.four);
    $('gpa-ten-merged').textContent=fmt(totals.ten);
    $('gpa-weight-process').classList.toggle('invalid',!weightSumValid());
    $('gpa-weight-exam').classList.toggle('invalid',!weightSumValid());
    for (const tr of document.querySelectorAll('#gpa-rows tr[data-id], #gpa-mobile-cards [data-id]')){
      const data=totals.per[tr.dataset.id]; if (!data) continue;
      tr.querySelector('[data-result="total"]').textContent=fmt(data.score,1);
      tr.querySelector('[data-result="four"]').textContent=fmt(data.four,2);
    }
    return totals;
  }
  function render(){
    $('gpa-rows').innerHTML=gpa.rows.map(entry).join('');
    $('gpa-mobile-cards').innerHTML=gpa.rows.map(mobileEntry).join('');
    $('gpa-weight-process').value=gpa.weightProcess;
    $('gpa-weight-exam').value=gpa.weightExam;
    updateResults();
  }
  function toCSV(){
    const result=calculate();
    const quote = v => {const s=String(v??''); const fixed=/^[=+\-@\t\r]/.test(s)?"'"+s:s;return '"'+fixed.replace(/"/g,'""')+'"';};
    const lines=[['Môn','Số tín chỉ','Điểm thành phần','Điểm thi','Hệ số thành phần','Hệ số thi','Điểm tổng hệ 10','GPA môn hệ 4']];
    for(const row of gpa.rows){
      const r=result.per[row.id];
      lines.push([row.name,row.credits,row.process,row.exam,gpa.weightProcess,gpa.weightExam,r.score===null?'':fmt(r.score,1),r.four===null?'':fmt(r.four,2)]);
    }
    lines.push([]);lines.push(['Tổng tín chỉ',result.credits]);
    lines.push(['GPA học kỳ hệ 4',result.four===null?'':fmt(result.four)]);
    lines.push(['GPA học kỳ hệ 10',result.ten===null?'':fmt(result.ten)]);
    const blob = new Blob(['\ufeff'+lines.map(a => a.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a'); anchor.href=url;anchor.download='KHAIDEV_GPA_HocKy.csv';document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  for(const wrapper of [$('gpa-rows'),$('gpa-mobile-cards')]) wrapper.addEventListener('input', event => {
    const input=event.target.closest('input[data-field]');if(!input)return;
    const row = gpa.rows.find(r=>r.id===input.closest('[data-id]').dataset.id);if(!row)return;
    const key=input.dataset.field;if(!['name','credits','process','exam'].includes(key))return;
    row[key]=input.value;updateResults();store();
  });
  for(const wrapper of [$('gpa-rows'),$('gpa-mobile-cards')]) wrapper.addEventListener('click', event => {
    const btn=event.target.closest('[data-delete]');if(!btn)return;
    gpa.rows=gpa.rows.filter(r=>r.id!==btn.dataset.delete);
    if (!gpa.rows.length) gpa.rows=[empty()];render();store();
  });
  $('gpa-add-one').addEventListener('click',()=>{gpa.rows.push(empty());render();store();const target=matchMedia('(max-width:560px)').matches?'#gpa-mobile-cards .gpa-mobile-card:last-child [data-field="name"]':'#gpa-rows tr:last-child [data-field="name"]'; document.querySelector(target)?.focus();});
  $('gpa-add-five').addEventListener('click',()=>{for(let i=0;i<5;i++)gpa.rows.push(empty());render();store();});
  $('gpa-reset').addEventListener('click',()=>{
    if(!confirm('Xóa toàn bộ các môn và điểm GPA đang lưu trên thiết bị này?'))return;
    gpa=baseline();render();store();
  });
  function changeWeight(key,other){
    const input=$(key==='weightProcess'?'gpa-weight-process':'gpa-weight-exam');
    gpa[key]=input.value;
    const val=readNumber(input.value);
    if(val!==null && val>=0 && val<=1){
      gpa[other]=String(Number((1-val).toFixed(3))).replace('.',',');
      $(other==='weightProcess'?'gpa-weight-process':'gpa-weight-exam').value=gpa[other];
    }
    updateResults();store();
  }
  $('gpa-weight-process').addEventListener('input',()=>changeWeight('weightProcess','weightExam'));
  $('gpa-weight-exam').addEventListener('input',()=>changeWeight('weightExam','weightProcess'));
  $('gpa-export').addEventListener('click',toCSV);
  render();
})();
