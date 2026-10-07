const WebSocket = require('ws');
const http = require('http');
function getJSON(path) { return new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: 9222, path, timeout: 4000 }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)) } catch (e) { rej(e) } }); }).on('error', rej); }); }
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
    await eval_("location.hash = '#/settings'");
    await sleep(3000);
    const txt = await eval_('document.body.innerText');
    const i = txt.indexOf('Haptic');
    console.log(i >= 0 ? '...'+txt.slice(Math.max(0,i-120), i+120) : 'NO_HAPTIC');
    // 顺便再全扫设置页英文
    const ens = await eval_(`(() => {
      const out = []; const seen = new Set();
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walk.nextNode())) {
        const t = (n.textContent||'').trim();
        if (!t || t.length > 100 || seen.has(t)) continue;
        if (!/[A-Za-z]{3,}\\s+[A-Za-z]{2,}/.test(t)) continue;
        if (/^[a-z0-9._/-]+$/.test(t)) continue;
        seen.add(t); out.push(t);
      }
      return out.slice(0, 30);
    })()`);
    console.log('=== 设置页英文 ==='); ens.forEach(e => console.log(' ', e));
    ws.close(); process.exit(0);
  });
  setTimeout(() => { process.exit(1); }, 25000);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
