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
    // 回主页
    await eval_("location.hash = '#/'");
    await sleep(2500);
    // 开技能与工具
    const nav = await eval_(`(() => {
      const items = [...document.querySelectorAll('button,[role="button"],a')];
      const b = items.find(x => /技能与工具/.test(x.textContent || ''));
      if (b) { b.click(); return 'ok'; }
      return 'miss';
    })()`);
    console.log('nav:', nav);
    await sleep(2500);
    // 切插件大类
    await eval_(`[...document.querySelectorAll('[data-tour^="hub-category-"]')].find(b => /插件/.test(b.textContent))?.click()`);
    await sleep(2500);
    const txt = await eval_('document.body.innerText');
    const zh = txt.includes('机器人') || txt.includes('看板');
    console.log('插件页含中文(机器人/看板):', zh);
    // 抓插件区正文
    const m2 = txt.match(/插件[\s\S]{80,700}?(?=连接器|定时任务|$)/);
    console.log('=== 插件区 ===');
    console.log(m2 ? m2[0].slice(0, 600) : txt.slice(-600));
    ws.close(); process.exit(0);
  });
  setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 40000);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
