'use strict';

const https = require('https');

const UPLOAD_URL = 'https://api.weixin.qq.com/cgi-bin/media/uploadimg';
const MAX_SIZE = 1 * 1024 * 1024; // 1MB，微信要求严格小于
const REQUEST_TIMEOUT_MS = 10 * 1000;

function detectFormat(buffer) {
  if (buffer.length < 4) return null;
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'png';
  return null;
}

function clientError(msg) {
  const err = new Error(msg);
  err.statusCode = 400;
  return err;
}

function uploadImageToWx({ accessToken, buffer }) {
  const format = detectFormat(buffer);
  if (!format) {
    return Promise.reject(clientError('不支持的图片格式，内容图仅支持 JPG/PNG'));
  }
  if (buffer.length >= MAX_SIZE) {
    return Promise.reject(clientError(`图片大小 ${(buffer.length / 1024).toFixed(1)}KB 须小于 1MB`));
  }

  const mimetype = format === 'png' ? 'image/png' : 'image/jpeg';
  const ext = format === 'png' ? '.png' : '.jpg';
  const boundary = `----WxUploadBoundary${Date.now()}`;

  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="media"; filename="upload${ext}"\r\n` +
    `Content-Type: ${mimetype}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, buffer, tail]);

  return new Promise((resolve, reject) => {
    const req = https.request(
      `${UPLOAD_URL}?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
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
          if (result.errcode) return reject(new Error(`微信上传图片失败 [${result.errcode}]: ${result.errmsg}`));
          resolve(result.url);
        });
      }
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('上传内容图超时')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { uploadImageToWx, MAX_SIZE };
