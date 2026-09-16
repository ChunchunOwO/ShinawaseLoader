// CLI argument parsing regression: boolean flags must not swallow the
// following positional (previously `check --no-smoke <dir>` turned the
// package directory into the flag's value and exited with a usage error).
// Runs the real CLI offline against the shipped mod template.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
