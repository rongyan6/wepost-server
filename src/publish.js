'use strict';

const https = require('https');

const PUBLISH_URL = 'https://api.weixin.qq.com/cgi-bin/freepublish/submit';
const REQUEST_TIMEOUT_MS = 10 * 1000;

/**
 * 发布草稿，返回 { publish_id, msg_data_id }。
 * @param {string} accessToken
 * @param {string} mediaId  草稿的 media_id
 */
function publishDraft(accessToken, mediaId) {
  if (!mediaId || typeof mediaId !== 'string') {
    return Promise.reject(new Error('media_id 必填且须为字符串'));
  }

  const body = JSON.stringify({ media_id: mediaId });

  return new Promise((resolve, reject) => {
    const req = https.request(
      `${PUBLISH_URL}?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let result;
          try {
            result = JSON.parse(raw);
          } catch {
            return reject(new Error(`微信接口响应解析失败: ${raw}`));
          }
          if (result.errcode && result.errcode !== 0) {
            return reject(new Error(`发布草稿失败 [${result.errcode}]: ${result.errmsg}`));
          }
          resolve({ publish_id: result.publish_id, msg_data_id: result.msg_data_id });
        });
      }
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('发布草稿请求超时')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { publishDraft };
