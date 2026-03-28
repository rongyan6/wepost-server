'use strict';

const https = require('https');

const DRAFT_BATCHGET_URL = 'https://api.weixin.qq.com/cgi-bin/draft/batchget';
const REQUEST_TIMEOUT_MS = 10 * 1000;

/**
 * 获取草稿列表。
 * @param {string} accessToken
 * @param {object} opts
 * @param {number} opts.offset     起始位置，从 0 开始
 * @param {number} opts.count      返回数量，1-20
 * @param {number} [opts.no_content=0]  1=不返回 content 字段，0=返回
 */
function getDraftList(accessToken, { offset, count, no_content = 0 }) {
  if (typeof offset !== 'number' || offset < 0 || !Number.isInteger(offset)) {
    return Promise.reject(new Error('offset 须为非负整数'));
  }
  if (typeof count !== 'number' || count < 1 || count > 20 || !Number.isInteger(count)) {
    return Promise.reject(new Error('count 须为 1-20 的整数'));
  }
  if (no_content !== 0 && no_content !== 1) {
    return Promise.reject(new Error('no_content 须为 0 或 1'));
  }

  const body = JSON.stringify({ offset, count, no_content });

  return new Promise((resolve, reject) => {
    const req = https.request(
      `${DRAFT_BATCHGET_URL}?access_token=${accessToken}`,
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
          if (result.errcode) {
            return reject(new Error(`获取草稿列表失败 [${result.errcode}]: ${result.errmsg}`));
          }
          // 过滤微信内部字段，只返回业务数据
          const { errcode, errmsg, ...data } = result;
          resolve(data);
        });
      }
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('获取草稿列表请求超时')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { getDraftList };
