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
    // 回主页进设置
    await eval_("location.hash = '#/'");
    await sleep(2000);
    await eval_(`(() => { const i=[...document.querySelectorAll('button,[role="button"],a')].find(x=>/GEO平台账号设置|设置$/.test((x.textContent||'').trim())); i?.click(); })()`);
    await sleep(2500);
    const ctx = await eval_(`(() => {
      const el = [...document.querySelectorAll('*')].find(e => e.childElementCount === 0 && /Haptic feedback/.test(e.textContent||''));
      if (!el) return 'NOT_FOUND';
      let path = [];
      let n = el;
      for (let i=0;i<3&&n;i++){ path.push((n.getAttribute('data-tour')||n.tagName).slice(0,30)); n=n.parentElement; }
      // 周边文本
      let sib = el.parentElement?.innerText?.slice(0,200) || '';
      return path.join(' <- ') + ' || ctx: ' + sib.replace(/\\n/g,' | ');
    })()`);
    console.log(ctx);
    ws.close(); process.exit(0);
  });
  setTimeout(() => { process.exit(1); }, 25000);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
