const assert = require('node:assert/strict');
const {test} = require('node:test');
const {createApp} = require('../server.cjs');
test('clean startup serves assets without keys and protects local routes', async () => {
  const app = createApp({fetchImpl:async()=>{throw Error('Unexpected external request');}});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  try {
    const base = 'http://127.0.0.1:' + app.address().port;
    const html = await (await fetch(base)).text();
    assert(html.includes('百变虚拟角色'));
    const token = html.match(/name="local-session" content="([^"]+)"/)[1];
    const status = await (await fetch(base+'/api/status',{headers:{'X-Local-Token':token}})).json();
    assert.equal(status.configured,false);
    assert.equal(status.searchConfigured,false);
    for(const asset of ['/app.js','/style.css','/character-layers.js']) assert.equal((await fetch(base+asset)).status,200);
    for(const hidden of ['/server.cjs','/config.example.json','/.env','/tests/startup.test.cjs']) assert.equal((await fetch(base+hidden)).status,404);
    assert.equal((await fetch(base+'/api/status')).status,403);
    assert.equal((await fetch(base,{headers:{Origin:'https://example.com'}})).status,403);
  } finally { await new Promise(resolve=>app.close(resolve)); }
});
