const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

function createGateway({ upstream = 'http://127.0.0.1:17863', port = 17864, apkPath = path.resolve(__dirname, '../outputs/Pocket-Classic-0.2.0-debug.apk') } = {}) {
  let code = String(crypto.randomInt(100000, 1000000));
  let expires = Date.now() + 10 * 60 * 1000;
  const sessions = new Set();
  const failures = new Map();
  const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://127.0.0.1:17863', 'http://localhost:17863']);
  const local = ip => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
  const paths = new Map([['/api/status', 'GET'], ['/api/playlists', 'GET'], ['/api/tracks', 'GET'], ['/api/resolve', 'POST'], ['/api/daily', 'GET'], ['/api/roam', 'GET'], ['/api/liked', 'GET'], ['/api/queue-page','GET'], ['/api/queue-pin','POST']]);
  const safeEqual = (a, b) => typeof a === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  function currentCode() { if (Date.now() >= expires) { code = String(crypto.randomInt(100000, 1000000)); expires = Date.now() + 600000; } return code; }
  function json(res, value, status = 200, origin) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {}) }); res.end(JSON.stringify(value));
  }
  async function readBody(req) { let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 4096) throw Error('请求内容过长'); } return raw ? JSON.parse(raw) : {}; }
  function clean(value) {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(cookie|cookies|token|headers|MUSIC_U|MUSIC_A|qrImage|userId)$/i.test(key)).map(([key, value]) => [key, clean(value)]));
  }
  const server = http.createServer(async (req, res) => {
    const requestOrigin = req.headers.origin;
    const origin = requestOrigin && allowedOrigins.has(requestOrigin) ? requestOrigin : null;
    try {
      if (requestOrigin && !origin) return json(res, { error: '该页面无权访问音乐服务' }, 403);
      if (req.method === 'OPTIONS') { res.writeHead(204, { ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}), 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }); return res.end(); }
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'" }); return res.end(fs.readFileSync(path.join(__dirname, 'connect.html')));
      }
      if (url.pathname === '/health' && req.method === 'GET') return json(res, { service: 'Pocket Classic', version: '0.2.0' }, 200, origin);
      if (url.pathname === '/setup' && req.method === 'GET') {
        if (!local(req.socket.remoteAddress)) return json(res, { error: '请在电脑本机打开连接页查看配对码' }, 403, origin);
        let account = { authenticated: false };
        try { const response = await fetch(upstream + '/api/status', { signal: AbortSignal.timeout(3000) }); const body = await response.json(); account = { authenticated: !!body.authenticated, nickname: body.nickname || '' }; } catch {}
        const addresses = Object.values(os.networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => `http://${n.address}:${port}`);
        return json(res, { code: currentCode(), expiresAt: expires, addresses, account, apkAvailable: fs.existsSync(apkPath) }, 200, origin);
      }
      if (url.pathname === '/pair' && req.method === 'POST') {
        const ip = req.socket.remoteAddress;
        const previous = failures.get(ip);
        if (previous?.count >= 5 && previous.until > Date.now()) return json(res, { error: '配对码错误次数较多，请一分钟后再试' }, 429, origin);
        const body = await readBody(req);
        if (!safeEqual(String(body.code || ''), currentCode())) { failures.set(ip, { count: (previous?.until > Date.now() ? previous.count : 0) + 1, until: Date.now() + 60000 }); return json(res, { error: '配对码不正确或已过期，请查看电脑连接页' }, 401, origin); }
        failures.delete(ip);
        const token = crypto.randomBytes(32).toString('hex'); sessions.add(token);
        return json(res, { token }, 200, origin);
      }
      if (url.pathname === '/download' && req.method === 'GET') {
        if (!local(req.socket.remoteAddress) && !safeEqual(url.searchParams.get('code') || '', currentCode())) return json(res, { error: '请在下载地址中填写当前配对码' }, 401, origin);
        if (!fs.existsSync(apkPath)) return json(res, { error: '安装包尚未生成' }, 404, origin);
        res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': fs.statSync(apkPath).size, 'Content-Disposition': 'attachment; filename="Pocket-Classic-0.2.0-debug.apk"', 'Cache-Control': 'no-store' }); return fs.createReadStream(apkPath).pipe(res);
      }
      if (!paths.has(url.pathname) || req.method !== paths.get(url.pathname)) return json(res, { error: '没有此接口' }, 404, origin);
      const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
      if (!sessions.has(token)) return json(res, { error: '连接已失效，请使用电脑上的配对码重新连接' }, 401, origin);
      let route = url.pathname;
      if (route === '/api/liked') { const offset=url.searchParams.get('offset')??'0';if(!/^(0|[1-9][0-9]{0,4})$/.test(offset))return json(res,{error:'无效分页'},400,origin);route+='?offset='+offset; }
      if(route==='/api/queue-page'){const snapshot=url.searchParams.get('snapshot'),offset=url.searchParams.get('offset')??'0';if(!/^[a-f0-9-]{36}$/.test(snapshot||'')||!/^(0|[1-9][0-9]{0,4})$/.test(offset))return json(res,{error:'无效歌单快照或分页'},400,origin);route+='?snapshot='+snapshot+'&offset='+offset;}
      if (route === '/api/tracks') { const id = url.searchParams.get('id'); if (!/^\d+$/.test(id || '')) return json(res, { error: '无效歌单' }, 400, origin); route += '?id=' + id;if(url.searchParams.has('offset')){const offset=url.searchParams.get('offset');if(!/^(0|[1-9][0-9]{0,4})$/.test(offset))return json(res,{error:'无效分页'},400,origin);route+='&offset='+offset;} }
      const body = req.method === 'POST' ? await readBody(req) : null;
      const pin=route==='/api/queue-pin';
      if(body && (pin?!/^[a-f0-9-]{36}$/.test(body.snapshot||''):!/^\d+$/.test(String(body.id||''))))return json(res,{error:pin?'无效歌单快照':'无效歌曲'},400,origin);
      const response = await fetch(upstream + route, { method: req.method, headers: { 'X-Local-Probe': '1', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(pin?{snapshot:body.snapshot}:{id:body.id}) } : {}), signal: AbortSignal.timeout(28000) });
      return json(res, clean(await response.json()), response.status, origin);
    } catch (error) { return json(res, { error: error.name === 'TimeoutError' ? '音乐服务响应超时，请稍后重试' : '音乐服务暂时无法连接，请检查电脑登录页是否正常' }, 502, origin); }
  });
  return { server, getCode: currentCode };
}
module.exports = { createGateway };
if (require.main === module) {
  const gateway = createGateway();
  gateway.server.listen(17864, '0.0.0.0', () => console.log('Pocket Classic phone connection: http://127.0.0.1:17864'));
}
