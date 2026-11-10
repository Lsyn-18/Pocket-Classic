const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { root, call, errorSummary, prepareKey } = require('./bridge.cjs');
const { createDiscovery } = require('./discovery.cjs');
const {createLibrary}=require('./library.cjs');
const PORT = 17863;
const origin = `http://127.0.0.1:${PORT}`;
let cookie = '';
let qrKey = '';
let qrImage = '';
let timer;
let polling = false;
let snapshot = { phase: 'idle', authenticated: false, message: '点击生成二维码后，用网易云音乐 App 扫码授权。' };
let report = { checkedAt: new Date().toISOString(), login: 'pending', replacementSources: false };
const discovery = createDiscovery({call, getSession: () => ({cookie, authenticated: snapshot.authenticated})});
const library = createLibrary({call,getSession:()=>({cookie,authenticated:snapshot.authenticated,userId:snapshot.userId})});
const reportPath = path.join(__dirname, 'account-results.json');
function saveReport() {}
function send(res, value, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
async function playlists() {
  return library.playlists();
}
async function tracks(id,offset=0) { return library.tracks(id,offset); }
async function resolve(id,quality='standard') {
  return library.resolve(id,quality);
}
async function verifyAccount() {
  const r = await call('login_status', {}, cookie);
  const account = r.body.data?.account;
  const profile = r.body.data?.profile;
  if (!account?.id && !profile?.userId) throw new Error('扫码返回成功，但账号状态未能确认');
  snapshot = { phase: 'authorized', authenticated: true, userId: profile?.userId || account.id,
    nickname: profile?.nickname || '已登录用户', message: '网易云音乐已连接。' };
  report = { checkedAt: new Date().toISOString(), login: 'passed', replacementSources: false };
  console.log('NetEase account connected. Session remains in memory.');
}
async function poll() {
  if (polling || !qrKey || snapshot.authenticated) return;
  polling = true;
  const key = qrKey;
  try {
    const r = await call('login_qr_check', { key });
    if (key !== qrKey) return;
    const code = r.body.code;
    if (code === 800) { clearInterval(timer); snapshot = { phase: 'expired', authenticated: false, message: '二维码已过期，请重新生成。' }; }
    if (code === 801) snapshot.message = '等待使用网易云音乐 App 扫码。';
    if (code === 802) { snapshot.phase = 'confirm'; snapshot.message = '已扫码，请在手机上确认登录。'; }
    if (code === 803) {
      clearInterval(timer);
      cookie = r.body.cookie || r.cookie?.join(';') || '';
      qrKey = ''; qrImage = '';
      if (!cookie.includes('MUSIC_U=')) throw new Error('授权响应没有返回登录凭证');
      await verifyAccount();
    }
  } catch (e) {
    snapshot.message = errorSummary(e).message;
    if (cookie) { report.error = errorSummary(e); saveReport(); }
  } finally { polling = false; }
}
const server = http.createServer(async (req, res) => {
  try {
    if (!['127.0.0.1:' + PORT, 'localhost:' + PORT].includes(req.headers.host)) return send(res, { error: 'Invalid host' }, 403);
    if (req.headers.origin && ![origin, `http://localhost:${PORT}`].includes(req.headers.origin)) return send(res, { error: 'Invalid origin' }, 403);
    const url = new URL(req.url, origin);
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src https://*.music.126.net http://*.music.126.net; connect-src 'self'; frame-ancestors 'none'" });
      return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    }
    if (req.method === 'GET' && url.pathname === '/api/status') return send(res, { ...snapshot, qrImage });
    if (req.method === 'GET' && url.pathname === '/api/results') return send(res, report);
    if (req.method === 'GET' && url.pathname === '/api/playlists') return send(res, { playlists: await playlists() });
    if (req.method === 'GET' && url.pathname === '/api/liked') return send(res,await library.liked(url.searchParams.get('offset')??'0'));
    if (req.method === 'GET' && url.pathname === '/api/queue-page') return send(res,await library.queuePage(url.searchParams.get('snapshot'),url.searchParams.get('offset')??'0'));
    if (req.method === 'GET' && url.pathname === '/api/daily') return send(res, await discovery.daily());
    if (req.method === 'GET' && url.pathname === '/api/roam') return send(res, await discovery.roam());
    if (req.method === 'GET' && url.pathname === '/api/artists') return send(res,await library.artists(url.searchParams.get('offset')??'0'));
    if (req.method === 'GET' && url.pathname === '/api/artist-tracks') return send(res,await library.artistTracks(url.searchParams.get('id'),url.searchParams.get('offset')??'0'));
    if (req.method === 'GET' && url.pathname === '/api/tracks') {
      const id = url.searchParams.get('id');
      if (!/^\d+$/.test(id || '')) return send(res, { error: '无效歌单' }, 400);
      return send(res, await tracks(id,url.searchParams.get('offset')??'0'));
    }
    if (req.method === 'POST') {
      if (req.headers.origin !== origin && req.headers.origin !== `http://localhost:${PORT}` && req.headers['x-local-probe'] !== '1') return send(res, { error: 'Local page required' }, 403);
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 2048) throw new Error('Request too large'); }
      const data = body ? JSON.parse(body) : {};
      if(url.pathname==='/api/queue-pin')return send(res,library.pinSnapshot(data.snapshot));
      if (url.pathname === '/api/qr') {
        if (snapshot.authenticated) return send(res, { authenticated: true });
        clearInterval(timer);
        const r = await call('login_qr_key');
        qrKey = r.body.data?.unikey;
        if (!qrKey) throw { body: r.body };
        const image = await call('login_qr_create', { key: qrKey, qrimg: true });
        qrImage = image.body.data.qrimg;
        snapshot = { phase: 'waiting', authenticated: false, message: '请用网易云音乐 App 扫码，并在手机上确认授权。' };
        timer = setInterval(poll, 3000);
        return send(res, { ...snapshot, qrImage });
      }
      if (url.pathname === '/api/resolve') {
        if (!/^\d+$/.test(String(data.id || ''))) return send(res, { error: '无效歌曲' }, 400);
        return send(res, await resolve(data.id,data.quality??'standard'));
      }
      if (url.pathname === '/api/logout') {
        discovery.clear();
        cookie = ''; qrKey = ''; qrImage = ''; clearInterval(timer);
        snapshot = { phase: 'idle', authenticated: false, message: '本地登录会话已清除。' };
        return send(res, snapshot);
      }
    }
    send(res, { error: 'Not found' }, 404);
  } catch (e) { send(res, { error: errorSummary(e).message,errorReason:errorSummary(e).reason }, [400,401].includes(e.status) ? e.status : 502); }
});
prepareKey().then(() => {
  server.listen(PORT, '127.0.0.1', () => console.log(`Netease connection probe: ${origin}`));
}).catch(e => { console.log(JSON.stringify(errorSummary(e))); process.exitCode = 1; });
