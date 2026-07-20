// Shared test helper: spawn a hook script as a child process with a JSON stdin
// payload, isolated CLAUDE_PLUGIN_DATA, and the repo as CLAUDE_PLUGIN_ROOT.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function makeDataDir(prefix = 'novice-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function runHook(script, payload, { dataDir, env = {}, cwd } = {}) {
  return new Promise((resolve) => {
    const child = execFile(
      'node',
      [path.join(repoRoot, 'scripts', script)],
      {
        cwd: cwd ?? repoRoot,
        env: {
          ...process.env,
          CLAUDE_PLUGIN_DATA: dataDir,
          CLAUDE_PLUGIN_ROOT: repoRoot,
          ...env,
        },
        timeout: 15000,
      },
      (error, stdout, stderr) => {
        let output = null;
        if (stdout && stdout.trim() !== '') {
          try {
            output = JSON.parse(stdout);
          } catch {
            output = { _raw: stdout };
          }
        }
        resolve({ code: error ? (error.code ?? 1) : 0, output, stdout, stderr });
      },
    );
    child.stdin.write(typeof payload === 'string' ? payload : JSON.stringify(payload));
    child.stdin.end();
  });
}

export function additionalContextOf(result) {
  return result.output?.hookSpecificOutput?.additionalContext ?? null;
}

export function decisionOf(result) {
  const hso = result.output?.hookSpecificOutput;
  if (hso?.permissionDecision) return { decision: hso.permissionDecision, reason: hso.permissionDecisionReason };
  if (result.output?.decision) return { decision: result.output.decision, reason: result.output.reason };
  return null;
}

export function readSessionState(dataDir, sessionId) {
  const file = path.join(dataDir, 'sessions', sessionId, 'state.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function readProjectOverrides(dataDir) {
  const dir = path.join(dataDir, 'projects');
  try {
    return fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  } catch {
    return [];
  }
}
