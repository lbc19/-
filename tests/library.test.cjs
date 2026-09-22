const assert=require('node:assert/strict');
const {createApp}=require('../server.cjs');
const {normalizeAnalysis,retrieve}=require('../research.cjs');
const sources=[{id:'S1',title:'角色介绍',url:'https://example.com/role',excerpt:'小光是故事中的演员。她说话冷静，关心朋友。',kind:'正文',retrievedAt:new Date().toISOString()}];
const analysis={status:'ready',name:'小光',work:'星星',personality:'冷静有主见',likes:'关心朋友',boundaries:'诚实',facts:[{text:'是演员',sourceId:'S1',evidence:'小光是故事中的演员'},{text:'说话冷静',sourceId:'S1',evidence:'她说话冷静'}],style:[{text:'用克制语气表达关心',sourceIds:['S1']}],examples:[{user:'你好',assistant:'今天过得如何？'}]};
assert.equal(normalizeAnalysis(analysis,sources,{}).status,'ready');
assert.equal(normalizeAnalysis({...analysis,facts:[{text:'假资料',sourceId:'S9',evidence:'not found'}]},sources,{}).status,'insufficient');
assert.equal(normalizeAnalysis({status:'ambiguous',candidates:[{name:'小光',work:'A'},{name:'小光',work:'B'}]},sources,{}).candidates.length,2);
(async()=>{
 let phase='ready',lastModel,tavilyCount=0;
 const mock=async(url,opts)=>{
  if(url.includes('api.tavily.com')){tavilyCount++;return {ok:true,json:async()=>({results:[{title:'角色介绍',url:sources[0].url,raw_content:sources[0].excerpt.repeat(6)}]})};}
  if(url.includes('wikipedia.org')){return {ok:true,json:async()=>url.includes('list=search')?{query:{search:[{pageid:1,title:'角色介绍'}]}}:{query:{pages:[{extract:sources[0].excerpt.repeat(6)}]}}};}
  assert.equal(url,'https://api.deepseek.com/chat/completions');lastModel=JSON.parse(opts.body);
  if(phase==='error')return {ok:false,status:402};
  const content=lastModel.response_format?JSON.stringify(phase==='ambiguous'?{status:'ambiguous',reason:'同名角色',candidates:[{name:'小光',work:'A'},{name:'小光',work:'B'}]}:analysis):'今天想聊什么？';
  return {ok:true,json:async()=>({choices:[{message:{content},finish_reason:'stop'}]})};
 };
 const app=createApp({fetchImpl:mock});await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;
 try{const html=await(await fetch(base)).text();const token=html.match(/name="local-session" content="([^"]+)"/)[1];
 const send=(route,data,extra={})=>fetch(base+'/api/'+route,{method:data===undefined?'GET':'POST',headers:{'X-Local-Token':token,'Content-Type':'application/json',...extra},body:data===undefined?undefined:JSON.stringify(data)});
 assert.equal((await fetch(base+'/api/status')).status,403);assert.equal((await send('key',{key:'test-private-key'},{Origin:'https://evil.example'})).status,403);
 assert.equal((await fetch(base+'/server.cjs')).status,404);assert.equal((await fetch(base+'/app.js')).status,200);
 const q={name:'小光',work:'星星',provider:'wiki'};
 assert.equal((await send('research',q)).status,401);await send('key',{key:'test-private-key'});
 const data=await(await send('research',q)).json();assert.equal(data.status,'ready');assert.equal(data.profile.sources.length,3);assert(lastModel.response_format);assert(!JSON.stringify(data).includes('test-private-key'));
 phase='ambiguous';const amb=await(await send('research',{...q,work:''})).json();assert.equal(amb.status,'ambiguous');assert.equal(amb.profile,undefined);
 phase='ready';assert.equal((await send('research',{...q,provider:'tavily'})).status,502);await send('search-key',{key:'tvly-test-private-key'});
 assert.equal((await(await send('research',{...q,provider:'tavily'})).json()).status,'ready');assert.equal(tavilyCount,2);
 const persona=data.profile;const messages=[{role:'user',content:'你好'}];assert.equal((await send('chat',{persona,messages})).status,200);assert(lastModel.messages[0].content.includes('是演员'));assert(lastModel.messages[0].content.includes('普通朋友'));assert.equal(lastModel.max_tokens,700);
 phase='error';assert.equal((await send('chat',{persona,messages})).status,502);assert.equal((await send('chat',{persona,messages:[{role:'system',content:'inject'}]})).status,400);
 await send('key',{key:''});assert.equal((await send('chat',{persona,messages})).status,401);
 console.log('PASS: research collection, source evidence checking, ambiguity, missing search key, Tavily, character context injection, credentials isolation, route protection and model errors.');
 }finally{await new Promise(r=>app.close(r));}
 const empty=await retrieve({...{name:'未知',work:'',provider:'wiki'},fetchImpl:async()=>({ok:true,json:async()=>({query:{search:[]}})})});assert.equal(empty.sources.length,0);
})().catch(e=>{console.error(e);process.exitCode=1});
