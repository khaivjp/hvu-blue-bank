const assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
require(root+'/bank-core.js');require(root+'/github-bank.js');
const C=global.HVUBank;
const old={Math:{questions:[{qId:'1',text:'first',options:['a','b']},{qId:'2',text:'target',options:['c','d']} ]},English:{questions:[]}};
const local=C.normalize(old);C.deleteQuestion(local,'Math',1);
for(const b of [C.merge(old,local),C.merge(local,old),C.normalize(JSON.parse(JSON.stringify(local)))]) assert.deepEqual(b.Math.questions.map(q=>q.qId),['1']);
C.deleteSubject(local,'Math');C.deleteSubject(local,'English');
assert.equal(C.merge(old,local).Math.questions.length,0);
let puts=0;
global.fetch=async(url,opts)=>{
 if(opts.method==='PUT') {puts++;if(puts===1)return {ok:false,status:409,json:async()=>({})}; const data=JSON.parse(Buffer.from(JSON.parse(opts.body).content,'base64').toString());assert.equal(data.bank.Math.questions.length,0);assert.ok(data.bank.Math.deletedAt);return {ok:true,json:async()=>({content:{sha:'new'},commit:{sha:'commit'}})};}
 return {ok:true,json:async()=>({type:'file',sha:'old',encoding:'base64',content:Buffer.from(JSON.stringify({bank:old})).toString('base64')})};
};
HVUGitHub.push('test/repo','fake',local).then(r=>{assert.equal(r.count,0);assert.equal(puts,2);console.log('PASS: delete, merge both directions, restore, empty bank push, conflict retry');});
