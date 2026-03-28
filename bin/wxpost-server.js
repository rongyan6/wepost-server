#!/usr/bin/env node

'use strict';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: wxpost-server [--port <n>]

Options:
  --port <n>   监听端口（优先级高于配置文件和 PORT 环境变量）
  --help, -h   显示帮助

首次运行会自动在 ~/.@rongyan/env.json 创建配置模板。
配置文件路径：~/.@rongyan/env.json
`);
  process.exit(0);
}

const { startServer } = require('../src/index.js');

// 解析 --port <n> 或 --port=<n>
function parsePort(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) return parseInt(args[i + 1], 10);
    const m = args[i].match(/^--port=(\d+)$/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

const cliPort = parsePort(args);
startServer({ port: cliPort });
