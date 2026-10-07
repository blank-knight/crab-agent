// 全界面英文残留扫描: 主页/设置/技能工具三大页,抓可见英文串(排除会话数据)
const WebSocket = require('ws');
const http = require('http');
function getJSON(path) { return new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: 9222, path, timeout: 4000 }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)) } catch (e) { rej(e) } }); }).on('error', rej); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const targets = await getJSON('/json/list');
  const page = targets.find(t => t.type === 'page');
  if (!page) { console.log('NO_PAGE'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl, { handshakeTimeout: 4000 });
  let id = 0; const pending = new Map();
  const call = (method, params = {}) => new Promise(res => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  ws.on('open', async () => {
    const eval_ = async (expr) => (await call('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
    // 逐walk可见文本元素(排除脚本/样式),按元素收集(避免同段重复)
    const EN = /[A-Za-z]{3,}(?:\s+[A-Za-z]{2,}){1,}/;
    const scanPage = async (label) => {
      const hits = await eval_(`(() => {
        const out = [];
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const seen = new Set();
        let n;
        while ((n = walk.nextNode())) {
          const t = (n.textContent || '').trim();
          if (!t || t.length > 120) continue;
          if (!/[A-Za-z]{3,}\\s+[A-Za-z]{2,}/.test(t)) continue;
          // 排除: 纯技术词(无空格单词)、路径、代码
          if (/^[a-z0-9._/-]+$/.test(t)) continue;
          if (seen.has(t)) continue;
          seen.add(t);
          out.push(t);
        }
        return out.slice(0, 25);
      })()`);
      console.log('=== ' + label + ' ===');
      hits.forEach(h => console.log('  ' + h));
    };
    // 1 主页(聊天)
    await eval_("location.hash = '#/'");
    await sleep(2500);
    await scanPage('主页/聊天');
    // 2 设置
    await eval_(`[...document.querySelectorAll('button,[role="button"],a')].find(x => /GEO平台账号设置|设置/.test(x.textContent||'') && /设置/.test(x.textContent||''))?.click()`);
    await sleep(2500);
    await scanPage('设置页');
    ws.close(); process.exit(0);
  });
  setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 45000);
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
