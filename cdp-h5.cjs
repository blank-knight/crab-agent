const WebSocket = require('ws');
const http = require('http');
function getJSON(path) { return new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: 9222, path, timeout: 4000 }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)) } catch (e) { rej(e) } }); }).on('error', rej); }); }
(async () => {
  const targets = await getJSON('/json/list');
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { handshakeTimeout: 4000 });
  let id = 0; const pending = new Map();
  const call = (method, params = {}) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  ws.on('open', async () => {
    const eval_ = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
    const html = await eval_('document.documentElement.innerHTML');
    const i = html.indexOf('Haptic feedback');
    if (i < 0) { console.log('NOT_IN_HTML'); }
    else console.log(html.slice(Math.max(0, i - 400), i + 100).replace(/\\s+/g, ' '));
    ws.close(); process.exit(0);
  });
  setTimeout(() => { process.exit(1); }, 15000);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
