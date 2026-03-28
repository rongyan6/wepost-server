'use strict';

const fs = require('fs');
const path = require('path');
const { getLogDir } = require('./config');

const RETAIN_DAYS = 7;

// 当前写入的日志文件描述符缓存
let _currentDate = '';
let _stream = null;
let _logDir = null;

function getDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getStream() {
  const today = getDateString();
  if (_currentDate === today && _stream) return _stream;

  // 日期变了，关闭旧 stream
  if (_stream) {
    _stream.end();
    _stream = null;
  }

  if (!_logDir) {
    _logDir = getLogDir();
    fs.mkdirSync(_logDir, { recursive: true });
    pruneOldLogs(_logDir);
  }

  const logFile = path.join(_logDir, `${today}.log`);
  _stream = fs.createWriteStream(logFile, { flags: 'a' });
  _stream.on('error', () => {
    // 写文件出错（如磁盘满）时重置 stream，下次重试创建；不崩进程
    _stream = null;
    _currentDate = '';
  });
  _currentDate = today;
  return _stream;
}

function pruneOldLogs(logDir) {
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
  let entries;
  try {
    entries = fs.readdirSync(logDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!/^\d{4}-\d{2}-\d{2}\.log$/.test(entry)) continue;
    const filePath = path.join(logDir, entry);
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(filePath);
    } catch {
      // 删除失败忽略
    }
  }
}

function formatLocalTime(d) {
  const pad2 = (n) => String(n).padStart(2, '0');
  const pad3 = (n) => String(n).padStart(3, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
         `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
}

function write(level, message) {
  const line = `[${formatLocalTime(new Date())}] [${level}] ${message}\n`;
  process.stdout.write(Buffer.from(line, 'utf-8'));
  try {
    const stream = getStream();
    if (stream) stream.write(Buffer.from(line, 'utf-8'));
  } catch {
    // 写文件失败不影响主流程
  }
}

const logger = {
  info: (msg) => write('INFO ', msg),
  warn: (msg) => write('WARN ', msg),
  error: (msg) => write('ERROR', msg),
};

module.exports = logger;
