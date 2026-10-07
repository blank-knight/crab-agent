const WebSocket = require('ws');
const http = require('http');
function getJSON(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path, timeout: 4000 }, r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)) } catch (e) { rej(e) } });
    }).on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const targets = await getJSON('/json/list');
  const page = targets.find(t => t.type === 'page');
  if (!page) { console.log('NO_PAGE'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl, { handshakeTimeout: 4000 });
  let id = 0; const pending = new Map();
  const call = (method, params = {}) => new Promise(res => {
    const mid = ++id; pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });
  ws.on('open', async () => {
    const eval_ = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
    // 硬reload(清模块缓存)
    await call('Page.reload', { ignoreCache: true });
    await sleep(4000);
    // 插件页
    await eval_(`[...document.querySelectorAll('[data-tour^="hub-category-"]')].find(b => /插件/.test(b.textContent))?.click()`);
    await sleep(2000);
    let txt = await eval_('document.body.innerText');
    let i = txt.indexOf('插件');
    console.log('=== 插件页 ===');
    console.log(txt.slice(i, i + 600));
    ws.close(); process.exit(0);
  });
  setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 30000);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
