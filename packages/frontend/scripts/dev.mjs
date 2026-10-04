#!/usr/bin/env node
/**
 * クロスプラットフォームな dev サーバー起動ラッパー。
 *
 * ポートはハードコードせず env / .env.local から取る。開発統括ローカルは .env.local で
 * 上書きし、譲渡先は .env.example の素直な値 (3000) を使う想定（12-factor）。
 *
 * package.json の `next dev -p ${PORT:-3000}` 形式は POSIX シェル前提で Windows
 * (PowerShell / cmd) では展開されないため、Node で port を解決してから next を起動する。
 */
import { spawn } from 'node:child_process';
import { resolvePort } from './resolve-port.mjs';

const port = resolvePort();

// --turbopack: dev のルート別 on-demand コンパイルを webpack より大幅に高速化する
// （タブ初回クリックの待ち短縮）。本番ビルド（next build）は webpack のまま不変。
const child = spawn('next', ['dev', '--turbopack', '-p', port], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
