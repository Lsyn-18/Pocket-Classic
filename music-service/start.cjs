const { spawn } = require('node:child_process');
const path = require('node:path');
const { createGateway } = require('./gateway.cjs');
async function start() {
  try {
    const response = await fetch('http://127.0.0.1:17864/health', { signal: AbortSignal.timeout(1200) });
    if ((await response.json()).service === 'Pocket Classic') { console.log('音乐服务已运行：http://127.0.0.1:17864'); return; }
  } catch {}
  let auth;
  try { const response = await fetch('http://127.0.0.1:17863/api/status', { signal: AbortSignal.timeout(2000) }); if (!response.ok) throw Error(); }
  catch { auth = spawn(process.execPath, [path.join(__dirname, 'auth-server.cjs')], { stdio: 'inherit', windowsHide: true, cwd: __dirname }); }
  const { server } = createGateway();
  server.listen(17864, '0.0.0.0', () => console.log('手机配对页：http://127.0.0.1:17864\n播放器预览：http://127.0.0.1:17863'));
  const stop = () => { auth?.kill(); server.close(() => process.exit(0)); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
start().catch(e => { console.error(e.message); process.exitCode = 1; });
