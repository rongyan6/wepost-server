'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.@rongyan');
const CONFIG_PATH = path.join(CONFIG_DIR, 'env.json');

const DEFAULT_UPLOAD_DIR = path.join(os.homedir(), '.@rongyan', 'upload_dir');
const DEFAULT_LOG_DIR = path.join(os.homedir(), '.@rongyan', 'log');

const TEMPLATE = {
  port: 3000,
  api_key: '__YOUR_API_KEY__',
  upload_dir: DEFAULT_UPLOAD_DIR,
  log_dir: DEFAULT_LOG_DIR,
  defaultAccount: 'wx__YOUR_APP_ID__',
  accounts: {
    'wx__YOUR_APP_ID__': {
      appSecret: '__YOUR_APP_SECRET__',
    },
  },
};

function ensureConfig() {
  if (fs.existsSync(CONFIG_PATH)) return false;

  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(TEMPLATE, null, 2) + '\n', { mode: 0o600, encoding: 'utf-8' });
  return true;
}

let _cache = null;

function loadConfig() {
  if (_cache) return _cache;

  const created = ensureConfig();
  if (created) {
    console.error([
      '',
      '  配置文件已创建：' + CONFIG_PATH,
      '  请编辑该文件，填入你的公众号 AppID 和 AppSecret，然后重新启动。',
      '',
      '  格式说明：',
      '    port            — 监听端口（也可用 --port 参数或 PORT 环境变量覆盖）',
      '    api_key         — HTTP 接口鉴权密钥',
      '    upload_dir      — 本地图片存储目录（默认 ~/.@rongyan/upload_dir/）',
      '    log_dir         — 日志目录（默认 ~/.@rongyan/log/）',
      '    defaultAccount  — 默认使用的 AppID',
      '    accounts        — 以 AppID 为 key，每个账号填写对应的 appSecret',
      '',
    ].join('\n'));
    process.exit(1);
  }

  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  try {
    _cache = JSON.parse(raw);
  } catch (e) {
    throw new Error(`配置文件 JSON 格式错误 (${CONFIG_PATH}): ${e.message}`);
  }

  return _cache;
}

function getAccount(appId) {
  const config = loadConfig();
  const id = appId || config.defaultAccount;
  if (!id) {
    throw new Error('未指定 appId，且配置中没有 defaultAccount。');
  }
  const account = config.accounts?.[id];
  if (!account) {
    const available = Object.keys(config.accounts || {}).join(', ') || '(空)';
    throw new Error(`账号 "${id}" 不存在。可用账号：${available}`);
  }
  if (!account.appSecret) {
    throw new Error(`账号 "${id}" 缺少 appSecret。`);
  }
  return { appId: id, appSecret: account.appSecret };
}

function listAccounts() {
  const config = loadConfig();
  return Object.keys(config.accounts || {});
}

function getUploadDir() {
  const config = loadConfig();
  return config.upload_dir || DEFAULT_UPLOAD_DIR;
}

function getLogDir() {
  const config = loadConfig();
  return config.log_dir || DEFAULT_LOG_DIR;
}

module.exports = { loadConfig, getAccount, listAccounts, getUploadDir, getLogDir, CONFIG_PATH };
