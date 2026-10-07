const WebSocket = require('ws');
const http = require('http');
function getJSON(path) { return new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: 9222, path: '/json/list', timeout: 4000 }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)) } catch (e) { rej(e) } }); }).on('error', rej); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const targets = await getJSON('/json/list');
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { handshakeTimeout: 4000 });
  let id = 0; const pending = new Map();
  const call = (method, params = {}) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  ws.on('open', async () => {
    const eval_ = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
    const info = await eval_(`(() => {
      const el = [...document.querySelectorAll('*')].find(e => e.childElementCount === 0 && /disk-cleanup/.test(e.textContent||''));
      if (!el) return 'notfound';
      let cls = [];
      let n = el;
      for (let i=0;i<4&&n;i++){ cls.push(n.tagName+'.'+(n.className||'').toString().slice(0,40)); n=n.parentElement; }
      return cls.join(' <- ');
    })()`);
    console.log('disk-cleanup DOM:', info);
    ws.close(); process.exit(0);
  });
  setTimeout(() => { process.exit(1); }, 15000);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
