const WebSocket = require('ws');
const http = require('http');
function getJSON(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path, timeout: 4000 }, r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)) } catch (e) { rej(e) } });
    }).on('error', rej);
  });
}
(async () => {
  const targets = await getJSON('/json/list');
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { handshakeTimeout: 4000 });
  let id = 0; const pending = new Map();
  const errors = [];
  const call = (method, params = {}) => new Promise(res => {
    const mid = ++id; pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push((d.exception?.description || d.text || '').slice(0, 500));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300));
    }
  });
  ws.on('open', async () => {
    await call('Runtime.enable');
    // Retry按钮=重新渲染错误面
    const eval_ = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
    await eval_(`[...document.querySelectorAll('button')].find(b => /Retry/.test(b.textContent))?.click()`);
    await new Promise(r => setTimeout(r, 3000));
    console.log('=== 捕获的异常 ===');
    console.log(errors.slice(0, 5).join('\n----\n') || '(none captured)');
    ws.close(); process.exit(0);
  });
  setTimeout(() => { console.log('errors:', errors.join('\n') || 'none'); process.exit(1); }, 20000);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
