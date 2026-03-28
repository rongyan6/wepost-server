'use strict';

const https = require('https');

const ADD_MATERIAL_URL = 'https://api.weixin.qq.com/cgi-bin/material/add_material';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB，微信要求严格小于
const REQUEST_TIMEOUT_MS = 10 * 1000;

const FORMAT_MAP = {
  jpeg: { mimetype: 'image/jpeg', ext: '.jpg' },
  png:  { mimetype: 'image/png',  ext: '.png' },
  gif:  { mimetype: 'image/gif',  ext: '.gif' },
  bmp:  { mimetype: 'image/bmp',  ext: '.bmp' },
};

function detectFormat(buffer) {
  if (buffer.length < 4) return null;
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'png';
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'gif';
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) return 'bmp';
  return null;
}

function clientError(msg) {
  const err = new Error(msg);
  err.statusCode = 400;
  return err;
}

function addImageMaterial(accessToken, { buffer }) {
  const format = detectFormat(buffer);
  if (!format) {
    return Promise.reject(clientError('不支持的图片格式，永久素材仅支持 JPG/PNG/GIF/BMP'));
  }
  if (buffer.length >= MAX_SIZE) {
    return Promise.reject(clientError(`图片大小 ${(buffer.length / 1024 / 1024).toFixed(1)}MB 须小于 10MB`));
  }

  const { mimetype, ext } = FORMAT_MAP[format];
  const boundary = `----WxMaterialBoundary${Date.now()}`;

  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="media"; filename="material${ext}"\r\n` +
    `Content-Type: ${mimetype}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, buffer, tail]);

  return new Promise((resolve, reject) => {
    const req = https.request(
      `${ADD_MATERIAL_URL}?access_token=${accessToken}&type=image`,
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
          if (result.errcode) return reject(new Error(`上传永久素材失败 [${result.errcode}]: ${result.errmsg}`));
          resolve({ media_id: result.media_id, url: result.url });
        });
      }
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('上传永久素材超时')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { addImageMaterial, MAX_SIZE };
