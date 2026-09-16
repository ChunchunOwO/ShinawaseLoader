// CLI argument parsing regression: boolean flags must not swallow the
// following positional (previously `check --no-smoke <dir>` turned the
// package directory into the flag's value and exited with a usage error).
// Runs the real CLI offline against the shipped mod template.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../ShinawaseLoader/testing/cli.mjs', import.meta.url));
const templateDir = fileURLToPath(new URL('../ShinawaseLoader/mod-template', import.meta.url));

const runCli = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', windowsHide: true, timeout: 60000 });

test('boolean flag before the positional still runs check', () => {
  const result = runCli('check', '--no-smoke', templateDir, '--json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.command, 'check');
  assert.equal(report.ok, true);
  assert.ok(!report.stages.some((stage) => stage.id === 'harness-smoke'), '--no-smoke skipped the harness smoke');
});

test('value flag before the positional still consumes its value', () => {
  const result = runCli('check', '--settle-ms', '50', templateDir, '--json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.ok(report.stages.some((stage) => stage.id === 'harness-smoke' && stage.ok), 'smoke ran with the settle value');
});

// Regression: `node --test <bareDir>` fails on this Node line ("Cannot find
// module"), so the test command must enumerate *.test.mjs files itself. The
// old bare-directory spawn always exited 1, so exit 0 here proves the fix;
// the failing-file case proves the discovered files actually execute.
test('test command runs *.test.mjs files in a directory (including nested)', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'shinawase-cli-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'sample.test.mjs'), "import test from 'node:test';\ntest('passes', () => {});\n");
  mkdirSync(join(dir, 'nested'));
  writeFileSync(join(dir, 'nested', 'deep.test.mjs'), "import test from 'node:test';\ntest('nested passes', () => {});\n");
  const passing = runCli('test', dir);
  assert.equal(passing.status, 0, `${passing.stdout}\n${passing.stderr}`);

  writeFileSync(join(dir, 'failing.test.mjs'), "import test from 'node:test';\ntest('fails', () => { throw new Error('boom'); });\n");
  const failing = runCli('test', dir);
  assert.equal(failing.status, 1, 'a failing discovered test file propagates exit code 1');
});

test('test command reports a directory without test files as a usage error', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'shinawase-cli-empty-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = runCli('test', dir);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no \*\.test\.mjs files/u);
});
