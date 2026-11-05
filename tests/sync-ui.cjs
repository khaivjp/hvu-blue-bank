const {JSDOM}=require('jsdom');
const fs=require('node:fs'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..')+'/';
const clone=x=>JSON.parse(JSON.stringify(x));
const initial={Math:{questions:[1,2,3,4].map(n=>({qId:String(n),text:'Câu '+n,options:['một','hai'],correctIndex:0})),lastUpdated:1}};
const wait=async check=>{for(let i=0;i<300;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw Error('Condition timeout');};
const good=data=>({ok:true,json:async()=>data});
function server(){return {payload:{exportedAt:'initial',bank:clone(initial)},sha:1,puts:0,writes:0,deny:false,conflict:false,putGate:null,getGate:null,async fetch(url,opts={}){
 if(url.includes('images/'))return good({content:Buffer.from('{"files":{}}').toString('base64')});
 if(opts.method==='PUT'){
  this.puts++;const body=JSON.parse(opts.body);
  if(this.putGate){const f=this.putGate;this.putGate=null;await f();}
  if(this.deny)return {ok:false,status:403,json:async()=>({message:'Resource not accessible by personal access token'})};
  if(this.conflict){this.conflict=false;this.payload.bank.Math.questions.push({qId:'new',text:'New from another device',options:['x','y']});this.sha++;return {ok:false,status:409,json:async()=>({})};}
  assert.equal(body.sha,String(this.sha));this.payload=JSON.parse(Buffer.from(body.content,'base64'));this.sha++;this.writes++;return good({content:{sha:String(this.sha)},commit:{sha:'commit'+this.sha}});
 }
 if(this.getGate){const f=this.getGate;this.getGate=null;await f();}
 return good({type:'file',sha:String(this.sha),encoding:'base64',content:Buffer.from(JSON.stringify(this.payload)).toString('base64')});
}};}
async function boot(remote,{cache,auto=false}={}){
 const dom=new JSDOM(fs.readFileSync(root+'index.html','utf8'),{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,d=w.document,intervals=[],errors=[];
 w.addEventListener('error',e=>errors.push(e.error));w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.AbortSignal=AbortSignal;
 w.fetch=remote.fetch.bind(remote);w.setInterval=f=>{intervals.push(f);return 1;};w.localStorage.setItem('hvu_auto_push',auto?'on':'off');w.sessionStorage.setItem('khaidev_pat_session_v1','fake');if(cache)w.localStorage.setItem('khaidev_bank_fallback_v1',cache);
 for(const f of ['bank-core.js','github-bank.js','export-utils.js','app.js','study.js'])w.eval(fs.readFileSync(root+f,'utf8'));
 await wait(()=>w.BankApp.state.connected&&!w.BankApp.state.busy);
 const A=w.BankApp,C=w.HVUBank;const editor=()=>{A.switchPage('editor');d.getElementById('edit-subject').value='Math';d.getElementById('edit-subject').onchange();};
 const chooseAnswer=(id,value)=>{editor();const i=A.qs('Math').findIndex(q=>q.qId===id);d.querySelector(`input[name="edit-${i}"][value="${value}"]`).click();return i;};
 return {dom,w,d,A,C,intervals,errors,chooseAnswer};
}
(async()=>{
 const remote=server();let t=await boot(remote),{w,d,A,C}=t;
 assert.equal(d.getElementById('push-data').disabled,false);assert.equal(d.getElementById('bank-push-data').disabled,false);
 t.chooseAnswer('2',1);A.state.selected='Math';A.render();A.switchPage('bank');d.querySelector('[data-pick-question="0"]').click();d.querySelector('[data-pick-question="3"]').click();await d.getElementById('delete-selected').onclick();
 remote.conflict=true;await d.getElementById('bank-push-data').onclick();assert.equal(remote.puts,2);assert.deepEqual(remote.payload.bank.Math.questions.map(q=>q.qId),['2','3','new']);assert.equal(C.correctIndex(remote.payload.bank.Math.questions[0]),1);assert.equal(A.state.dirty,false);assert.equal(d.getElementById('push-data').disabled,false);
 const cache=w.localStorage.getItem('khaidev_bank_fallback_v1');t.dom.window.close();t=await boot(remote,{cache});({w,d,A,C}=t);assert.deepEqual(Array.from(A.qs('Math'),q=>q.qId),['2','3','new']);assert.equal(C.correctIndex(A.qs('Math')[0]),1);
 console.log('PASS: connect unlock, unsaved answer + selected deletions, 409 retry, other device changes, reload');
 t.chooseAnswer('2',0);await A.deleteItem('Math',1);remote.deny=true;await d.getElementById('push-data').onclick();assert.equal(A.state.dirty,true);assert.equal(A.state.busy,false);assert.equal(d.getElementById('push-data').disabled,false);const failed=JSON.parse(w.localStorage.getItem('khaidev_bank_fallback_v1'));assert.equal(failed.dirty,true);assert.equal(C.correctIndex(failed.bank.Math.questions[0]),0);assert.ok(!failed.bank.Math.questions.some(q=>q.qId==='3'));remote.deny=false;await d.getElementById('push-data').onclick();assert.equal(A.state.dirty,false);
 console.log('PASS: rejected writes retain edits and deletions; retry succeeds');
 let release,started=false;remote.putGate=async()=>{started=true;await new Promise(r=>release=r);};const p=d.getElementById('push-data').onclick();await wait(()=>started);let index=t.chooseAnswer('2',1);d.querySelector(`[data-save-answer="${index}"]`).click();await wait(()=>C.correctIndex(A.qs('Math')[0])===1);release();await p;assert.equal(A.state.dirty,true);assert.equal(C.correctIndex(A.qs('Math')[0]),1);await d.getElementById('push-data').onclick();assert.equal(A.state.dirty,false);assert.equal(C.correctIndex(remote.payload.bank.Math.questions[0]),1);
 console.log('PASS: edits made during a write stay pending and reach the next write');
 A.switchPage('bank');remote.payload.exportedAt='poll-version';await t.intervals[0]();assert.equal(A.state.busy,false);assert.equal(d.getElementById('push-data').disabled,false);
 let releaseGet,getStarted=false;remote.getGate=async()=>{getStarted=true;await new Promise(r=>releaseGet=r);};const read=d.getElementById('refresh').onclick();await wait(()=>getStarted);t.chooseAnswer('2',0);const before=remote.writes;await d.getElementById('push-data').onclick();releaseGet();await read;await wait(()=>remote.writes>before&&!A.state.busy);assert.equal(C.correctIndex(remote.payload.bank.Math.questions[0]),0);
 console.log('PASS: polling unlocks buttons; push requested during loading is queued');
 await A.deleteItem('Math');assert.equal(d.getElementById('bank-push-data').disabled,false);await d.getElementById('bank-push-data').onclick();assert.equal(remote.payload.bank.Math.questions.length,0);assert.ok(remote.payload.bank.Math.deletedAt);assert.equal(A.state.dirty,false);assert.equal(t.errors.length,0);t.dom.window.close();
 console.log('PASS: deleting the last subject still writes successfully');
 const r2=server();let t2=await boot(r2);t2.chooseAnswer('1',1);r2.deny=true;await t2.d.getElementById('push-data').onclick();const offline=t2.w.localStorage.getItem('khaidev_bank_fallback_v1');t2.dom.window.close();r2.deny=false;t2=await boot(r2,{cache:offline,auto:true});await wait(()=>r2.writes===1&&!t2.A.state.busy);assert.equal(t2.C.correctIndex(r2.payload.bank.Math.questions[0]),1);assert.equal(t2.A.state.dirty,false);t2.dom.window.close();console.log('PASS: pending offline edits automatically resume after reconnect');
})().catch(e=>{console.error(e);process.exit(1)});
