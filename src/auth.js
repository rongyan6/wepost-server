'use strict';

const crypto = require('crypto');
const { loadConfig } = require('./config');

/**
 * 校验请求中的 API Key。
 * 支持两种方式：
 *   Authorization: Bearer <api_key>
 *   X-Api-Key: <api_key>
 *
 * 使用 timingSafeEqual 防止时序攻击。
 * @returns {string|null} 错误描述，null 表示通过
 */
function checkApiKey(req) {
  const config = loadConfig();
  const expected = config.api_key;

  if (!expected || expected === '__YOUR_API_KEY__') {
    return 'api_key 未配置，请在 env.json 中设置 api_key';
  }

  const authHeader = req.headers['authorization'];
  const xApiKey = req.headers['x-api-key'];

  let provided = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    provided = authHeader.slice(7).trim();
  } else if (xApiKey) {
    provided = xApiKey.trim();
  }

  if (!provided) {
    return '缺少 API Key（Authorization: Bearer <key> 或 X-Api-Key: <key>）';
  }

  const bufExpected = Buffer.from(expected);
  const bufProvided = Buffer.from(provided);
  if (bufProvided.length !== bufExpected.length ||
      !crypto.timingSafeEqual(bufProvided, bufExpected)) {
    return 'API Key 无效';
  }

  return null;
}

module.exports = { checkApiKey };
