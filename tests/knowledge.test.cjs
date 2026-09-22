const assert=require('node:assert/strict');
const {research}=require('../research.cjs');
const {normalizeKnowledge}=require('../knowledge.cjs');
const {createApp}=require('../server.cjs');
const q={name:'樱岛麻衣',work:'青春猪头少年',provider:'knowledge'};
const raw={status:'ready',name:q.name,work:q.work,personality:'冷静、有主见，适度调侃',knowledge:['角色背景仅为测试模型记忆'],style:[{text:'克制表达关心',sourceIds:['fake']}],sources:[{url:'https://fake.example'}],facts:[{text:'伪造事实'}],examples:[{user:'你好',assistant:'今天过得好吗？'}]};
(async()=>{
let calls=0;
const data=await research(q,'',async(messages,json)=>{calls++;assert(json);assert(messages[0].content.includes('本次没有联网'));return {content:JSON.stringify(raw)};},async()=>{throw Error('Knowledge mode must never perform retrieval');});
assert.equal(calls,1);assert.equal(data.profile.origin,'knowledge');assert.deepEqual(data.profile.sources,[]);assert.deepEqual(data.profile.facts,[]);assert.deepEqual(data.profile.style[0].sourceIds,[]);assert(data.profile.unknowns[0].includes('未联网核实'));
assert.equal(normalizeKnowledge({status:'ambiguous',candidates:[{name:'小光',work:'A'},{name:'小光',work:'B'}]},q).candidates.length,2);
assert.equal(normalizeKnowledge({status:'insufficient',reason:'不认识'},q).profile,undefined);
await assert.rejects(()=>research(q,'',async()=>({content:'bad json'})),/完整角色资料/);
let last,mode='ready';const app=createApp({fetchImpl:async(url,opts)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');last=JSON.parse(opts.body);if(mode==='error')return {ok:false,status:402};return {ok:true,json:async()=>({choices:[{message:{content:last.response_format?JSON.stringify(raw):'你好'},finish_reason:'stop'}]})};}});
await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;
try{const html=await(await fetch(base)).text();assert(html.includes('<title>百变虚拟角色</title>'));assert(html.indexOf('value="knowledge"')<html.indexOf('value="wiki"'));const token=html.match(/name="local-session" content="([^"]+)"/)[1];const post=(route,obj)=>fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Local-Token':token},body:JSON.stringify(obj)});
assert.equal((await post('research',q)).status,401);await post('key',{key:'fake-test-key-only'});
const generated=await(await post('research',q)).json();assert.equal(generated.status,'ready');assert.equal(generated.profile.query.provider,'knowledge');
assert.equal((await post('chat',{persona:generated.profile,messages:[{role:'user',content:'你好'}]})).status,200);assert(last.messages[0].content.includes('角色背景仅为测试模型记忆'));assert(last.messages[0].content.includes('未联网核实'));
mode='error';assert.equal((await post('research',q)).status,502);
console.log('PASS: knowledge-only generation, zero search calls, missing key, profile validation, no fabricated sources, ambiguity/unknown/invalid JSON, chat grounding, naming and default mode.');
}finally{await new Promise(r=>app.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
