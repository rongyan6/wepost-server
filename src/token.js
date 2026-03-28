'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const STABLE_TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/stable_token';
const CACHE_PATH = path.join(os.homedir(), '.@rongyan', 'tokens.json');
const CACHE_TMP = CACHE_PATH + '.tmp';

// 提前 5 分钟视为过期，避免边界问题
const EXPIRE_BUFFER_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;

function readCache() {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeCache(cache) {
  // 原子写：先写临时文件再 rename，防止 crash 导致缓存损坏；权限 0600 保护 token
  fs.writeFileSync(CACHE_TMP, JSON.stringify(cache, null, 2) + '\n', { mode: 0o600, encoding: 'utf-8' });
  fs.renameSync(CACHE_TMP, CACHE_PATH);
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error(`响应解析失败: ${raw}`));
        }
      });
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('获取 access_token 超时')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * 获取稳定版 access_token，自动读缓存、到期后刷新。
 * @param {string} appId
 * @param {string} appSecret
 * @param {boolean} [forceRefresh=false]
 */
async function getStableToken(appId, appSecret, forceRefresh = false) {
  const cache = readCache();
  const cached = cache[appId];
  const now = Date.now();

  if (!forceRefresh && cached && cached.expiresAt - EXPIRE_BUFFER_MS > now) {
    return cached.accessToken;
  }

  const result = await post(STABLE_TOKEN_URL, {
    grant_type: 'client_credential',
    appid: appId,
    secret: appSecret,
    force_refresh: forceRefresh,
  });

  if (result.errcode) {
    throw new Error(`获取 access_token 失败 [${result.errcode}]: ${result.errmsg}`);
  }

  cache[appId] = {
    accessToken: result.access_token,
    expiresAt: now + result.expires_in * 1000,
  };
  writeCache(cache);

  return result.access_token;
}

module.exports = { getStableToken };
