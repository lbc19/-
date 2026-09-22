// Local-only DeepSeek bridge. The key stays in process memory and is never logged.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {research} = require('./research.cjs');
const Layers=require('./character-layers.js');
const MODEL = 'deepseek-flash';

function createApp({fetchImpl = globalThis.fetch} = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  let apiKey = '', searchKey = '', busy = false, requests = 0;
  async function model(messages,structured=false){
    if(requests>=100)throw Error('本次后台已达 100 次模型请求上限，请检查用量后再重启。');
    requests++;
    let r;try{r=await fetchImpl('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},body:JSON.stringify({model:MODEL,messages,max_tokens:structured?5500:700,thinking:{type:'disabled'},stream:false,...(structured?{response_format:{type:'json_object'}}:{})}),signal:AbortSignal.timeout(structured?110000:60000)});}catch{throw Error('DeepSeek 连接失败或超时。请求可能已经计费，请检查网络后手动重试。');}
    if(!r.ok)throw Error(({401:'DeepSeek 密钥无效。',402:'DeepSeek 余额不足。',429:'DeepSeek 暂时繁忙，请稍后重试。'})[r.status]||'DeepSeek 请求失败（HTTP '+r.status+'）。');
    const d=await r.json(),content=d.choices?.[0]?.message?.content;
    if(typeof content!=='string'||!content.trim())throw Error('模型没有返回正文，请重试。');
    if(structured&&d.choices[0].finish_reason==='length')throw Error('角色分析超出输出长度，请缩小角色范围后重试。');
    return {content:content.slice(0,structured?32000:10000),model:MODEL,usage:d.usage?{prompt_tokens:d.usage.prompt_tokens,completion_tokens:d.usage.completion_tokens}:null,truncated:d.choices[0].finish_reason==='length'};
  }
  const json = (res, status, data) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(data)); };
  const server = http.createServer(async (req, res) => {
    const authority = `127.0.0.1:${server.address().port}`;
    const origin = `http://${authority}`;
    if (req.headers.host !== authority || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return json(res,403,{error:'只能从本机应用页面访问。'});
    if (req.method === 'GET' && req.url === '/') {
      const html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8').replace('LOCAL_SESSION_TOKEN',token);
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}); return res.end(html);
    }
    if(req.method==='GET'&&['/app.js','/style.css','/character-layers.js'].includes(req.url)){
      res.writeHead(200,{'Content-Type':req.url.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(fs.readFileSync(path.join(__dirname,req.url.slice(1))));
    }
    if (!req.url.startsWith('/api/')) return json(res,404,{error:'页面不存在。'});
    if (req.headers['x-local-token'] !== token) return json(res,403,{error:'页面已过期，请刷新后重试。'});
    if (req.method === 'GET' && req.url === '/api/status') return json(res,200,{configured:!!apiKey,searchConfigured:!!searchKey,model:MODEL,requests,limit:100,version:4});
    if (req.method !== 'POST' || !['/api/key','/api/search-key','/api/chat','/api/research'].includes(req.url)) return json(res,404,{error:'接口不存在。'});
    if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res,415,{error:'请求格式不正确。'});
    let data;
    try {
      let length=0; const chunks=[];
      for await (const chunk of req) { length+=chunk.length; if(length>200000) {json(res,413,{error:'消息过长。'});return;} chunks.push(chunk); }
      data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!data || typeof data !== 'object') throw Error();
    } catch { return json(res,400,{error:'无法读取请求。'}); }
    if (req.url === '/api/key' || req.url === '/api/search-key') {
      if(busy) return json(res,409,{error:'请等当前回复结束后再修改密钥。'});
      if(typeof data.key !== 'string' || (data.key !== '' && !/^[\x21-\x7e]{12,256}$/.test(data.key))) return json(res,400,{error:'密钥格式不正确，请完整复制，去掉前后空格。'});
      if(req.url==='/api/search-key')searchKey=data.key;else apiKey=data.key;
      return json(res,200,{configured:!!apiKey,searchConfigured:!!searchKey,model:MODEL});
    }
    if(!apiKey) return json(res,401,{error:'请先在左侧填写 DeepSeek API 密钥。'});
    if(busy) return json(res,429,{error:'正在回复中，请稍后再发送。'});
    if(requests>=100) return json(res,429,{error:'本次启动已达 100 次请求上限。请检查用量，需要继续时重启程序。'});
    if(req.url==='/api/research'){
      if(typeof data.name!=='string'||!data.name.trim()||data.name.length>60||typeof data.work!=='string'||data.work.length>120||!['knowledge','wiki','tavily'].includes(data.provider))return json(res,400,{error:'请填写有效角色名与检索方式。'});
      busy=true;
      try{return json(res,200,await research({name:data.name.trim(),work:data.work.trim(),provider:data.provider},searchKey,model,fetchImpl));}
      catch(e){return json(res,502,{error:e.message});}finally{busy=false;}
    }
    let p;try{p=Layers.attach(data.persona||{});}catch{return json(res,400,{error:'角色分层资料格式不正确。'});}
    const limits={name:60,personality:1000,likes:600,boundaries:1000};
    if(!p || !Object.keys(limits).every(k=>typeof p[k]==='string' && p[k].trim() && p[k].length<=limits[k]) || !Array.isArray(data.messages) || !data.messages.length || data.messages.length>20 || !data.messages.every(m=>m && ['user','assistant'].includes(m.role) && typeof m.content==='string' && m.content.trim() && m.content.length<=10000) || data.messages.at(-1).role!=='user') return json(res,400,{error:'人设或聊天内容格式不正确。'});
    let remaining=16000; const history=[];
    for(const m of [...data.messages].reverse()) {const content=m.content.slice(-remaining);history.unshift({role:m.role,content});remaining-=content.length;if(remaining<=0)break;}
    const system=Layers.chatPrompt(p);
    busy=true;
    try{return json(res,200,await model([{role:'system',content:system},...history]));}
    catch(e){return json(res,502,{error:e.message});}
    finally{busy=false;}
  });
  return server;
}

if(require.main===module){
  const server=createApp();
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'端口 3210 已占用。若程序已经启动，请访问 http://127.0.0.1:3210；否则关闭占用程序后重试。':'本地服务启动失败。');process.exitCode=1;});
  server.listen(3210,'127.0.0.1',()=>console.log('百变虚拟角色已启动：http://127.0.0.1:3210\n请在页面填写密钥。密钥只留在本次后台运行的内存中。关闭后台后需重新填写。'));
}
module.exports={createApp};
