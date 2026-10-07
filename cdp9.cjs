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
  if (!page) { console.log('NO_PAGE_YET'); process.exit(1); }
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
    await sleep(2500);
    // 开技能与工具
    await eval_(`(() => { const i=[...document.querySelectorAll('button,[role="button"],a')].find(x=>/技能与工具/.test(x.textContent||'')); i?.click(); })()`);
    await sleep(2500);
    // 技能rail英文分类残留?
    let rail = await eval_(`document.querySelector('[data-tour="hub-nav"]')?.innerText ?? 'NO_RAIL'`);
    console.log('=== 技能rail ==='); console.log(rail);
    // 切插件
    await eval_(`[...document.querySelectorAll('[data-tour^="hub-category-"]')].find(b => /插件/.test(b.textContent))?.click()`);
    await sleep(2500);
    let txt = await eval_('document.body.innerText');
    const hasZh = ['机器人','看板','电台'].some(w => txt.includes(w));
    const en = txt.match(/[A-Za-z]{4,}/g) ? [...new Set(txt.match(/\b[A-Z][a-z]+(?:\s[A-Za-z]+){1,}\b/g) || [])].slice(0,8) : [];
    console.log('插件页中文命中:', hasZh);
    console.log('插件页英文短语样本:', JSON.stringify(en));
    ws.close(); process.exit(0);
  });
  setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 35000);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
