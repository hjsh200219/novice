#!/usr/bin/env node
// PostToolBatch: single writer over the per-tool event files. Aggregates
// success/failure fingerprints into session state, deletes processed events,
// and injects AT MOST ONE novice intervention per batch when the same work
// keeps failing past the level's threshold. novice off → aggregation still
// happens, intervention text does not.
// Observation hook: fail open (exit 0) on any internal error.
import fs from 'node:fs';
import path from 'node:path';
import { readStdinJson, emitAdditionalContext, failOpen } from './lib/hookio.js';
import { getProjectConfig, loadSession, saveSession, sessionEventsDir, readJsonSafe } from './lib/state.js';
import { loadLevels } from './lib/capsule.js';

const MAX_TRACKED_FINGERPRINTS = 50;

function readAndClearEvents(sessionId) {
  const dir = sessionEventsDir(sessionId);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const events = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    const event = readJsonSafe(file, null);
    if (event && typeof event.fingerprint === 'string') events.push(event);
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // best-effort deletion; a leftover file is re-aggregated next batch at worst
    }
  }
  return events;
}

function aggregate(session, events) {
  const stats = session.loop_stats && typeof session.loop_stats === 'object' ? session.loop_stats : {};
  for (const event of events) {
    const entry = stats[event.fingerprint] ?? { count: 0, failures: 0, intervened_at_failures: 0 };
    entry.count += 1;
    if (event.status === 'failure') entry.failures += 1;
    entry.last_ts = event.ts ?? Date.now();
    stats[event.fingerprint] = entry;
  }
  // Cap stored fingerprints: drop oldest by last_ts.
  const keys = Object.keys(stats);
  if (keys.length > MAX_TRACKED_FINGERPRINTS) {
    keys
      .sort((a, b) => (stats[a].last_ts ?? 0) - (stats[b].last_ts ?? 0))
      .slice(0, keys.length - MAX_TRACKED_FINGERPRINTS)
      .forEach((k) => delete stats[k]);
  }
  session.loop_stats = stats;
  return stats;
}

// Pick at most one fingerprint that crossed the threshold since its last intervention.
function pickIntervention(stats, threshold) {
  let best = null;
  for (const [fingerprint, entry] of Object.entries(stats)) {
    const newFailures = entry.failures - (entry.intervened_at_failures ?? 0);
    if (newFailures >= threshold && (!best || entry.failures > best.entry.failures)) {
      best = { fingerprint, entry };
    }
  }
  return best;
}

function main() {
  const input = readStdinJson();
  const sessionId = input.session_id;
  const cwd = input.cwd || process.cwd();
  if (typeof sessionId !== 'string' || sessionId === '') return;

  const session = loadSession(sessionId);
  const events = readAndClearEvents(sessionId);
  if (events.length === 0) return;

  const stats = aggregate(session, events);
  const config = getProjectConfig(cwd);

  if (config.enabled) {
    const levels = loadLevels();
    const threshold = levels.levels[String(config.level)]?.repeat_failure_threshold ?? 3;
    const target = pickIntervention(stats, threshold);
    if (target) {
      target.entry.intervened_at_failures = target.entry.failures;
      emitAdditionalContext(
        'PostToolBatch',
        `[novice] 같은 작업이 ${target.entry.failures}회 실패했어요. 같은 방법을 반복하면 시간과 사용량만 늘어날 수 있어요. ` +
          '다음 중 하나를 권해요: (1) 마지막 오류 메시지를 사용자에게 그대로 보여 주고 원인을 함께 확인, ' +
          '(2) 접근 방법을 바꿔 다시 시도, (3) 지금까지 시도한 내용을 정리하고 사용자 확인을 받기.',
      );
    }
  }

  saveSession(sessionId, session);
}

try {
  main();
  process.exit(0);
} catch {
  failOpen();
}
