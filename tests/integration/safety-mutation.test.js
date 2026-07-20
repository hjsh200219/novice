// Mutation fixtures for the safety gate (PRD §4.5: 단위·통합·mutation fixture).
// Deterministically mutates every dangerous supported-grammar command and requires
// the gate to hold the line: deny stays deny, ask stays ask or escalates to deny.
// A mutant that slips to "allow" is a detector bypass and fails the suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runHook, makeDataDir, decisionOf, repoRoot } from '../helpers/run-hook.js';
import { mutateCommand, mutateSecretLine } from '../helpers/mutate.js';
import { scanText } from '../../scripts/lib/secrets.js';

const SID = 'safety-mutation-session';

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-mutation-repo-'));
  const git = (args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'test']);
  fs.writeFileSync(path.join(dir, 'README.md'), '# fixture\n');
  git(['add', 'README.md']);
  git(['commit', '-q', '-m', 'init']);
  return dir;
}

async function judge(command, cwd, dataDir) {
  const r = await runHook(
    'pre-tool-use.js',
    { session_id: SID, cwd, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } },
    { dataDir, cwd },
  );
  return decisionOf(r)?.decision ?? 'allow';
}

const SEVERITY = { allow: 0, ask: 1, deny: 2 };

test('every mutant of a dangerous command is judged at equal or stricter severity', async () => {
  const dataDir = makeDataDir();
  const cwd = makeRepo();
  const corpus = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'tests', 'fixtures', 'safety', 'dangerous-supported.json'), 'utf8'),
  ).entries.filter((e) => e.tool_name === 'Bash');

  let totalMutants = 0;
  const failures = [];

  for (const entry of corpus) {
    const original = entry.tool_input.command.replaceAll('{{CWD}}', cwd);
    const mutants = mutateCommand(original);
    totalMutants += mutants.length;

    const results = await Promise.all(mutants.map((m) => judge(m.command, cwd, dataDir)));
    results.forEach((decision, i) => {
      if (SEVERITY[decision] < SEVERITY[entry.expect]) {
        failures.push(`[${mutants[i].op}] ${mutants[i].command} → ${decision} (original expect: ${entry.expect})`);
      }
    });
  }

  assert.ok(totalMutants >= 50, `mutation harness must not be vacuous — only ${totalMutants} mutants generated`);
  assert.deepEqual(failures, [], `detector bypassed by ${failures.length}/${totalMutants} mutants:\n${failures.join('\n')}`);
});

test('mutation operators actually produce the expected variants (harness sanity)', () => {
  const rm = mutateCommand('rm -rf /').map((m) => m.op);
  assert.ok(rm.includes('split-short-flags'));
  assert.ok(rm.includes('long-form-flags'));
  assert.ok(rm.includes('extra-whitespace'));

  const push = mutateCommand('git push -f origin main').map((m) => m.command);
  assert.ok(push.some((c) => c.includes('--force')), 'short→long force spelling');

  const ps = mutateCommand('Stop-Process -Name node').map((m) => m.command);
  assert.ok(ps.some((c) => c.startsWith('stop-process')), 'cmdlet case mutation');

  const home = mutateCommand('rm -rf ~').map((m) => m.command);
  assert.ok(home.some((c) => c.includes("'$HOME'")), 'home alias mutation');
});

test('secret scanner detects every quoting/spacing/prefix mutation of a credential line', () => {
  const token = 'ghp_' + 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0dF3gH6jK9m';
  for (const line of mutateSecretLine('GITHUB_TOKEN', token)) {
    const findings = scanText(line);
    assert.ok(findings.some((f) => f.id === 'github-token'), `scanner missed mutant line: ${line.replace(token, '<token>')}`);
  }
});

test('secret-bearing commit is still denied after content mutations', async () => {
  const dataDir = makeDataDir();
  const token = 'ghp_' + 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0dF3gH6jK9m';
  for (const line of mutateSecretLine('API_TOKEN', token).slice(0, 3)) {
    const cwd = makeRepo();
    fs.writeFileSync(path.join(cwd, '.env'), `${line}\n`);
    execFileSync('git', ['-C', cwd, 'add', '.env']);
    const decision = await judge('git commit -m "add env"', cwd, dataDir);
    assert.equal(decision, 'deny', `commit gate missed mutated env line: ${line.replace(token, '<token>')}`);
  }
});
