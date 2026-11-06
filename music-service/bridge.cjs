const fs = require('node:fs');
const path = require('node:path');
let root; try { root = path.dirname(require.resolve('@neteasecloudmusicapienhanced/api/package.json')); } catch { root = path.resolve(__dirname, '../work/netease-api-source'); }
const runtime = path.join(__dirname, 'runtime');
fs.mkdirSync(runtime, { recursive: true });
process.env.TEMP = runtime;
process.env.TMP = runtime;
process.env.ENABLE_GENERAL_UNBLOCK = 'false';
process.env.ENABLE_RANDOM_CN_IP = 'false';
process.env.ENABLE_PROXY = 'false';
delete process.env.NETEASE_COOKIE;
const tokenPath = path.join(runtime, 'anonymous_token');
if (!fs.existsSync(tokenPath)) fs.writeFileSync(tokenPath, '');
const utils = require(path.join(root, 'util'));
const request = require(path.join(root, 'util/request'));
global.deviceId = utils.generateDeviceId();
const originalLog = console.log.bind(console);
console.log = (...args) => {
  if (args[0] === '[ERR]') return originalLog('[upstream] request failed; sensitive details omitted');
  originalLog(...args);
};
async function call(name, params = {}, cookie = '') {
  const fn = require(path.join(root, 'module', name + '.js'));
  const res = await fn({ timeout: 18000, randomCNIP: false, ...params,
    cookie: typeof cookie === 'string' ? utils.cookieToJson(cookie) : cookie }, request);
  return res;
}
function errorSummary(e) {
  return { status: e.status || e.response?.status || null,
    code: e.body?.code || e.code || null,
    message: String(e.body?.msg || e.body?.message || e.message || 'request failed').slice(0, 220) };
}
async function prepareKey() {
  const requireFromApi = require('node:module').createRequire(path.join(root, 'package.json'));
  const axios = requireFromApi('axios').default;
  axios.defaults.timeout = 18000;
  const res = await call('register_xeapikey', { deviceId: global.deviceId });
  fs.writeFileSync(path.join(runtime, 'xeapi_public_key'), JSON.stringify(res.body));
  return { success: !!res.body.sk, version: res.body.version };
}
module.exports = { root, runtime, call, errorSummary, prepareKey };
