const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createGateway } = require('./gateway.cjs');
test('only paired clients can read music; credentials and arbitrary upstream paths stay private', async t => {
  const upstream = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ authenticated: true, nickname: 'test', cookie: 'DO-NOT-EXPORT', userId: 123, nested: { MUSIC_U: 'private', ok: true } })); });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  const { server, getCode } = createGateway({ upstream: `http://127.0.0.1:${upstream.address().port}`, port: 17865 });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.close(); upstream.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url + '/api/playlists')).status, 401);
  assert.equal((await fetch(url + '/api/daily')).status, 401);
  assert.equal((await fetch(url + '/api/roam')).status, 401);
  assert.equal((await fetch(url + '/setup', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  const bad = await fetch(url + '/pair', { method: 'POST', body: JSON.stringify({ code: 'wrong' }) }); assert.equal(bad.status, 401);
  const response = await fetch(url + '/pair', { method: 'POST', body: JSON.stringify({ code: getCode() }) });
  const { token } = await response.json(); assert.equal(token.length, 64);
  const headers = { Authorization: 'Bearer ' + token };
  const status = await (await fetch(url + '/api/status', { headers })).json();
  assert.equal(status.authenticated, true); assert.equal(status.cookie, undefined); assert.equal(status.userId, undefined); assert.deepEqual(status.nested, { ok: true });
  for (const route of ['/api/daily','/api/roam']) {
    const result = await (await fetch(url + route, {headers})).json();
    assert.equal(result.cookie, undefined); assert.equal(result.userId, undefined); assert.deepEqual(result.nested, {ok:true});
    assert.equal((await fetch(url + route, {method:'POST',headers})).status,404);
  }
  assert.equal((await fetch(url + '/api/qr', { method: 'POST', headers })).status, 404);
  assert.equal((await fetch(url + '/api/tracks?id=not-a-number', { headers })).status, 400);
  assert.equal((await fetch(url + '/api/status', { headers: { ...headers, Origin: 'https://untrusted.example' } })).status, 403);
});
