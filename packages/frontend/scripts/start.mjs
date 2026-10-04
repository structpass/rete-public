#!/usr/bin/env node
/**
 * クロスプラットフォームな本番サーバー起動ラッパー（dev.mjs と同じ理由で port を env から解決）。
 */
import { spawn } from 'node:child_process';
import { resolvePort } from './resolve-port.mjs';

const port = resolvePort();

const child = spawn('next', ['start', '-p', port], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
