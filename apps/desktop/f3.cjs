const WebSocket = require('ws');
(async () => {
  const list = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise(r => ws.on('open', r));
  let id = 0;
  const send = (method, params = {}) => new Promise(res => {
    const i = ++id;
    ws.send(JSON.stringify({ id: i, method, params }));
    const onMsg = d => { const m = JSON.parse(d); if (m.id === i) { ws.off('message', onMsg); res(m.result); } };
    ws.on('message', onMsg);
  });
  await send('Runtime.enable');
  // 皮肤现在是什么？主题是不是还在 celadon？
  const r = await send('Runtime.evaluate', { expression: `JSON.stringify({skin: localStorage.getItem('hermes-desktop-theme-v2'), mode: localStorage.getItem('hermes-desktop-mode-v1'), loadedFonts: [...document.fonts].map(f=>f.family+' '+f.status).filter(s=>/Rules|Collapse/i.test(s)).slice(0,5), stylesheets: document.styleSheets.length})`, returnByValue: true });
  console.log('state:', r.result.value);
  // 强制重设皮肤触发 applyTheme
  await send('Runtime.evaluate', { expression: `localStorage.setItem('hermes-desktop-theme-v2','celadon'); location.reload()` });
  await new Promise(r => setTimeout(r, 8000));
  const r2 = await send('Runtime.evaluate', { expression: `JSON.stringify({fontOk: document.fonts.check('16px "Rules Expanded"'), bodyFont: getComputedStyle(document.body).fontFamily.slice(0,50), radiusScalar: getComputedStyle(document.documentElement).getPropertyValue('--dt-radius-scalar').trim(), baseSize: getComputedStyle(document.documentElement).getPropertyValue('--dt-base-size').trim(), cssLink: [...document.querySelectorAll('link')].map(l=>l.href).filter(h=>h.includes('fonts'))})`, returnByValue: true });
  console.log('after:', r2.result.value);
  ws.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
