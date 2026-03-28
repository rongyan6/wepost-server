'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const busboy = require('busboy');
const { loadConfig, getAccount, getUploadDir } = require('./config');
const { getStableToken } = require('./token');
const { uploadImageToWx, MAX_SIZE } = require('./upload-image');
const { addDraft } = require('./draft');
const { getDraftList } = require('./draft-list');
const { publishDraft } = require('./publish');
const { addImageMaterial, MAX_SIZE: MATERIAL_MAX_SIZE } = require('./material');
const { checkApiKey } = require('./auth');
const logger = require('./logger');

const BODY_LIMIT = 2 * 1024 * 1024; // 2MB

function sendJSON(res, statusCode, data) {
  if (statusCode >= 400 && data.error) res._logError = data.error;
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readJSON(req, limit = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.setEncoding('utf-8');
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > limit) return;
      raw += chunk;
    });
    req.on('end', () => {
      if (size > limit) return reject({ status: 413, message: '请求体超过 2MB 限制' });
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject({ status: 400, message: '请求体须为合法 JSON' });
      }
    });
    req.on('error', (e) => reject({ status: 400, message: e.message }));
  });
}

async function withAuth(req, res, handler) {
  const authErr = checkApiKey(req);
  if (authErr) return sendJSON(res, 401, { ok: false, error: authErr });

  const qs = new URL(req.url, 'http://localhost').searchParams;
  const appId = qs.get('appid') || undefined;

  let account;
  try {
    account = getAccount(appId);
  } catch (e) {
    return sendJSON(res, 400, { ok: false, error: e.message });
  }

  let accessToken;
  try {
    accessToken = await getStableToken(account.appId, account.appSecret);
  } catch (e) {
    return sendJSON(res, 502, { ok: false, error: e.message });
  }

  return handler({ account, accessToken });
}

/**
 * 通用文件接收：busboy 接收 multipart 文件后调用 processor(buffer, filename)。
 * processor 抛出的错误若带 statusCode 属性则使用该状态码，否则默认 502。
 */
function receiveFile(req, res, account, sizeLimit, processor, sizeLimitLabel) {
  const uploadDir = getUploadDir();
  fs.mkdirSync(uploadDir, { recursive: true });

  const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: sizeLimit } });
  let settled = false;

  bb.on('file', (_fieldname, stream, info) => {
    const { filename } = info;
    const chunks = [];

    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('limit', () => {
      settled = true;
      stream.resume();
      logger.warn(`[${account.appId}] 上传图片超过限制: ${filename}`);
      sendJSON(res, 413, { ok: false, error: `图片超过 ${sizeLimitLabel} 限制` });
    });
    stream.on('end', async () => {
      if (settled) return;
      settled = true;

      const buffer = Buffer.concat(chunks);
      const now = new Date();
      const datestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const safeBasename = filename.split(/[\\/]/).pop() || 'image';
      const localPath = path.join(uploadDir, `${datestamp}_${safeBasename}`);

      try {
        fs.writeFileSync(localPath, buffer);
      } catch (e) {
        logger.error(`[${account.appId}] 本地保存失败: ${e.stack || e.message}`);
        return sendJSON(res, 500, { ok: false, error: `本地保存失败: ${e.message}` });
      }

      try {
        const result = await processor(buffer, filename);
        fs.unlink(localPath, () => {});
        sendJSON(res, 200, { ok: true, ...result });
      } catch (e) {
        fs.unlink(localPath, () => {});
        const status = e.statusCode || 502;
        if (status < 500) {
          logger.warn(`[${account.appId}] 上传校验失败: ${e.message}`);
        } else {
          logger.error(`[${account.appId}] 上传微信失败: ${e.stack || e.message}`);
        }
        sendJSON(res, status, { ok: false, error: e.message });
      }
    });
  });

  bb.on('finish', () => {
    if (!settled) {
      settled = true;
      sendJSON(res, 400, { ok: false, error: '请求中未包含文件' });
    }
  });

  bb.on('error', (e) => {
    if (!settled) {
      settled = true;
      logger.error(`[${account.appId}] 请求解析失败: ${e.stack || e.message}`);
      sendJSON(res, 400, { ok: false, error: `请求解析失败: ${e.message}` });
    }
  });

  req.pipe(bb);
}

async function handleUploadImage(req, res) {
  await withAuth(req, res, async ({ account, accessToken }) => {
    receiveFile(req, res, account, MAX_SIZE, async (buffer, filename) => {
      const url = await uploadImageToWx({ accessToken, buffer });
      logger.info(`[${account.appId}] 内容图上传成功: ${filename} -> ${url}`);
      return { url };
    }, '1MB');
  });
}

async function handleUploadMaterial(req, res) {
  await withAuth(req, res, async ({ account, accessToken }) => {
    receiveFile(req, res, account, MATERIAL_MAX_SIZE, async (buffer, filename) => {
      const result = await addImageMaterial(accessToken, { buffer });
      logger.info(`[${account.appId}] 永久素材上传成功: ${filename} -> media_id=${result.media_id}`);
      return result;
    }, '10MB');
  });
}

async function handleAddDraft(req, res) {
  await withAuth(req, res, async ({ account, accessToken }) => {
    let payload;
    try {
      payload = await readJSON(req);
    } catch (e) {
      return sendJSON(res, e.status, { ok: false, error: e.message });
    }

    if (!Array.isArray(payload.articles)) {
      return sendJSON(res, 400, { ok: false, error: '缺少 articles 数组' });
    }

    try {
      const mediaId = await addDraft(accessToken, payload.articles);
      logger.info(`[${account.appId}] 新增草稿成功: media_id=${mediaId}, 共 ${payload.articles.length} 篇`);
      sendJSON(res, 200, { ok: true, media_id: mediaId });
    } catch (e) {
      logger.error(`[${account.appId}] 新增草稿失败: ${e.stack || e.message}`);
      sendJSON(res, 400, { ok: false, error: e.message });
    }
  });
}

async function handleDraftList(req, res) {
  await withAuth(req, res, async ({ account, accessToken }) => {
    let payload;
    try {
      payload = await readJSON(req);
    } catch (e) {
      return sendJSON(res, e.status, { ok: false, error: e.message });
    }

    const offset = Number(payload.offset ?? 0);
    const count = Number(payload.count ?? 20);
    const no_content = Number(payload.no_content ?? 0);

    try {
      const result = await getDraftList(accessToken, { offset, count, no_content });
      logger.info(`[${account.appId}] 获取草稿列表: offset=${offset}, count=${count}, 返回 ${result.item_count}/${result.total_count}`);
      sendJSON(res, 200, { ok: true, ...result });
    } catch (e) {
      logger.error(`[${account.appId}] 获取草稿列表失败: ${e.stack || e.message}`);
      sendJSON(res, 400, { ok: false, error: e.message });
    }
  });
}

async function handlePublishDraft(req, res) {
  await withAuth(req, res, async ({ account, accessToken }) => {
    let payload;
    try {
      payload = await readJSON(req);
    } catch (e) {
      return sendJSON(res, e.status, { ok: false, error: e.message });
    }

    if (!payload.media_id) {
      return sendJSON(res, 400, { ok: false, error: '缺少 media_id' });
    }

    try {
      const result = await publishDraft(accessToken, payload.media_id);
      logger.info(`[${account.appId}] 发布草稿成功: media_id=${payload.media_id}, publish_id=${result.publish_id}`);
      sendJSON(res, 200, { ok: true, ...result });
    } catch (e) {
      logger.error(`[${account.appId}] 发布草稿失败: ${e.stack || e.message}`);
      sendJSON(res, 400, { ok: false, error: e.message });
    }
  });
}

async function handleRequest(req, res) {
  const { method, url } = req;

  if (method === 'POST' && url.startsWith('/upload-material')) {
    return handleUploadMaterial(req, res);
  }
  if (method === 'POST' && url.startsWith('/upload-image')) {
    return handleUploadImage(req, res);
  }
  if (method === 'POST' && url.startsWith('/draft/add')) {
    return handleAddDraft(req, res);
  }
  if (method === 'POST' && url.startsWith('/draft/list')) {
    return handleDraftList(req, res);
  }
  if (method === 'POST' && url.startsWith('/draft/publish')) {
    return handlePublishDraft(req, res);
  }

  sendJSON(res, 404, { ok: false, error: 'Not Found' });
}

function resolvePort(opts = {}) {
  if (opts.port) return opts.port;
  if (process.env.PORT) return parseInt(process.env.PORT, 10);
  const config = loadConfig();
  return config.port || 3000;
}

function startServer(opts = {}) {
  loadConfig();
  const PORT = resolvePort(opts);

  const server = http.createServer((req, res) => {
    const start = Date.now();
    // X-Forwarded-For 取第一个 IP（代理场景），否则用直连 IP
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.socket.remoteAddress
      || '-';

    res.on('finish', () => {
      const ms = Date.now() - start;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      const detail = res._logError ? ` — ${res._logError}` : '';
      logger[level](`${ip} ${req.method} ${req.url} ${res.statusCode} +${ms}ms${detail}`);
    });

    handleRequest(req, res).catch((err) => {
      logger.error(`未处理的请求异常: ${err.stack || err.message}`);
      if (!res.headersSent) sendJSON(res, 500, { ok: false, error: '服务器内部错误' });
    });
  });

  server.listen(PORT, () => {
    logger.info(`wxpost-server 启动，监听 http://localhost:${PORT}`);
  });

  return server;
}

module.exports = { startServer };
