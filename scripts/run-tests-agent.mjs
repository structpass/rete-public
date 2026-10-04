#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const MAX_SUMMARY_LINES = 12;
const MAX_WARNING_LINES = 8;
const MAX_FAILURE_LINES = 160;
const MAX_FAILURE_CHARS = 24_000;
const MAX_LINE_CHARS = 2_000;

const stripAnsi = (value) => value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');

function resolveCommands(argv, env) {
  const separator = argv.indexOf('--');
  if (separator >= 0 && argv[separator + 1]) {
    return [
      {
        command: argv[separator + 1],
        args: argv.slice(separator + 2),
        env,
      },
    ];
  }

  // package.json の test と同じ段を、各段とも同じCorepack解決済みpnpmで実行する。
  // 1本のtest script内で裸のpnpmを再帰起動すると、CodexのPATH overrideにある別版へ
  // すり替わるため、agent経路だけ段を明示する。契約ドリフトはunit testで検出する。
  // 先頭の build:shared は backend / frontend が @rete/shared の dist を解決するため
  // （B1・未ビルドだとクリーンな作業ツリーで型解決に失敗する）。
  const pnpmStages = [
    ['pnpm', 'run', 'build:shared'],
    ['pnpm', 'run', 'check:repo-invariants'],
    ['pnpm', '--filter', './packages/**', 'test'],
  ];
  const corepackHome = env.COREPACK_HOME || join(process.cwd(), '.corepack-cache');
  mkdirSync(corepackHome, { recursive: true });
  if (process.platform === 'win32') {
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path');
    const pathEntries = pathKey ? env[pathKey].split(';').filter(Boolean) : [];
    for (const entry of pathEntries) {
      const corepackCommand = join(entry, 'corepack.cmd');
      const corepackScript = join(entry, 'node_modules', 'corepack', 'dist', 'corepack.js');
      const adjacentNode = join(entry, 'node.exe');
      if (existsSync(corepackCommand) && existsSync(corepackScript)) {
        const base = {
          command: existsSync(adjacentNode) ? adjacentNode : process.execPath,
          env: { ...env, COREPACK_HOME: corepackHome },
        };
        return pnpmStages.map((args) => ({ ...base, args: [corepackScript, ...args] }));
      }
    }
    throw new Error('PATH上のcorepack.cmdに対応するcorepack.jsを解決できません');
  }

  return pnpmStages.map((args) => ({
    command: 'corepack',
    args,
    env: { ...env, COREPACK_HOME: corepackHome },
  }));
}

function isSummaryLine(line) {
  return (
    /(?:^|:\s+)(?:ℹ\s+)?(?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\s+\d/i.test(
      line,
    ) ||
    /(?:^|:\s+)(?:Test Suites:|Tests:|Snapshots:|Test Files|Start at|Duration|Time:|Ran all test suites)/i.test(
      line,
    )
  );
}

function isWarningLine(line) {
  return /(?:^|\W)(?:warn(?:ing)?|deprecated|deprecation|unhandled|did not exit|open handle)(?:\W|$)/i.test(
    line,
  );
}

function compactLine(stream, line) {
  const clean = stripAnsi(line).trimEnd();
  const cropped =
    clean.length > MAX_LINE_CHARS ? `${clean.slice(0, MAX_LINE_CHARS)}...[truncated]` : clean;
  return `[${stream}] ${cropped}`;
}

function failureTail(lines) {
  const markerIndex = lines.findIndex((line) =>
    /(?:✖ failing tests:|Failed Tests|\bFAIL\s+[^=]|ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL)/i.test(line),
  );
  const priorDiagnostics =
    markerIndex >= 0
      ? lines
          .slice(0, markerIndex)
          .filter((line) => /(?:Error:|AssertionError|\bfailed\b|\bfailure\b|✖)/i.test(line))
          .slice(-20)
      : [];
  const candidates = markerIndex >= 0 ? [...priorDiagnostics, ...lines.slice(markerIndex)] : lines;
  const selected = [];
  let chars = 0;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const line = candidates[index];
    if (selected.length >= MAX_FAILURE_LINES || chars + line.length + 1 > MAX_FAILURE_CHARS) {
      break;
    }
    selected.push(line);
    chars += line.length + 1;
  }

  return selected.reverse();
}

let commands;
try {
  commands = resolveCommands(process.argv.slice(2), process.env);
} catch (error) {
  console.error(`[test:agent] package managerを解決できません: ${error.message}`);
  process.exit(2);
}

const tempDirectory = mkdtempSync(join(tmpdir(), 'rete-test-agent-'));
const logPath = join(tempDirectory, 'output.log');
mkdirSync(tempDirectory, { recursive: true });
const logFd = openSync(logPath, 'wx', 0o600);

const startedAt = Date.now();
const tail = [];
const summaries = [];
const summarySet = new Set();
const warningLines = [];
const carries = { stdout: '', stderr: '' };
let sourceLines = 0;
let sourceChars = 0;
let warningCount = 0;
let finished = false;

function recordLine(stream, rawLine) {
  sourceLines += 1;
  const line = compactLine(stream, rawLine);
  tail.push(line);
  if (tail.length > MAX_FAILURE_LINES) tail.shift();

  const clean = line.replace(/^\[(?:stdout|stderr)]\s*/, '');
  if (isSummaryLine(clean) && !summarySet.has(clean)) {
    summarySet.add(clean);
    summaries.push(clean);
  }
  if (isWarningLine(clean)) {
    warningCount += 1;
    if (warningLines.length < MAX_WARNING_LINES) warningLines.push(line);
  }
}

function recordChunk(stream, chunk) {
  writeSync(logFd, chunk);
  const text = chunk.toString('utf8');
  sourceChars += text.length;
  const lines = `${carries[stream]}${text}`.split(/\r?\n/);
  carries[stream] = lines.pop() ?? '';
  for (const line of lines) recordLine(stream, line);
}

function flushCarries() {
  for (const stream of ['stdout', 'stderr']) {
    if (carries[stream]) recordLine(stream, carries[stream]);
    carries[stream] = '';
  }
}

function finish({ code, signal, error }) {
  if (finished) return;
  finished = true;
  flushCarries();
  closeSync(logFd);

  const durationSeconds = ((Date.now() - startedAt) / 1_000).toFixed(2);
  const succeeded = !error && code === 0 && !signal;

  if (succeeded) {
    console.log(
      `[test:agent] PASS duration=${durationSeconds}s source_lines=${sourceLines} source_chars=${sourceChars} warnings=${warningCount}`,
    );
    const selectedSummaries = summaries.slice(-MAX_SUMMARY_LINES);
    const fallback = tail.slice(-Math.min(8, tail.length));
    for (const line of selectedSummaries.length > 0 ? selectedSummaries : fallback) {
      console.log(line);
    }
    for (const line of warningLines) console.log(line);
    rmSync(tempDirectory, { recursive: true, force: true });
    return;
  }

  const exitCode = Number.isInteger(code) ? code : 1;
  const details = [
    `exit=${exitCode}`,
    signal ? `signal=${signal}` : null,
    `duration=${durationSeconds}s`,
    `source_lines=${sourceLines}`,
    `source_chars=${sourceChars}`,
    `full_log=${logPath}`,
  ]
    .filter(Boolean)
    .join(' ');
  console.error(`[test:agent] FAIL ${details}`);
  if (error) console.error(`[test:agent] spawn_error=${error.message}`);
  for (const line of summaries.slice(-MAX_SUMMARY_LINES)) console.error(line);
  // stdout/stderr のイベント到着順だけで保持した tail は、短命な子プロセスで stderr が
  // stdout の後段へ到着するなど、完全ログにある診断行を落とすことがある。失敗時は
  // close 済みの完全ログを正本に再抽出し、圧縮が原因で失敗理由を隠さない。
  const completeLogLines = readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => stripAnsi(line));
  const diagnostics = failureTail(completeLogLines);
  for (const line of diagnostics.length > 0 ? diagnostics : failureTail(tail)) {
    console.error(line);
  }
  process.exitCode = exitCode;
}

let activeChild = null;

function runStage(index) {
  if (index >= commands.length) {
    finish({ code: 0, signal: null, error: null });
    return;
  }

  const command = commands[index];
  console.error(
    `[test:agent] running stage=${index + 1}/${commands.length} ${basename(command.command)}; success output is condensed`,
  );
  const child = spawn(command.command, command.args, {
    cwd: process.cwd(),
    env: { ...command.env, FORCE_COLOR: '0' },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  activeChild = child;

  child.stdout.on('data', (chunk) => recordChunk('stdout', chunk));
  child.stderr.on('data', (chunk) => recordChunk('stderr', chunk));
  child.on('error', (error) => finish({ code: 1, signal: null, error }));
  child.on('close', (code, signal) => {
    if (finished) return;
    if (code === 0 && !signal) runStage(index + 1);
    else finish({ code, signal, error: null });
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (activeChild && !activeChild.killed) activeChild.kill(signal);
  });
}

runStage(0);
