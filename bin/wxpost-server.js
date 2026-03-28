#!/usr/bin/env node

'use strict';

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

const cliPort = parsePort(process.argv.slice(2));
startServer({ port: cliPort });
