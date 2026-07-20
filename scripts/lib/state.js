// State layer SSOT for the novice plugin.
// All persistent state lives under CLAUDE_PLUGIN_DATA — never under CLAUDE_PLUGIN_ROOT.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const STATE_FILE_MAX_BYTES = 256 * 1024;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const BUILTIN_DEFAULTS = Object.freeze({ level: 1, enabled: true });

export function dataDir(env = process.env) {
  const fromEnv = env.CLAUDE_PLUGIN_DATA;
  if (fromEnv && fromEnv.trim() !== '') return fromEnv;
  // Fallback keeps state out of the plugin root even on older runtimes.
  return path.join(os.homedir(), '.claude', 'novice-plugin-data');
}

export function projectKey(cwd = process.cwd()) {
  let canonical;
  try {
    canonical = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
  } catch {
    canonical = null;
  }
  if (!canonical) {
    try {
      canonical = fs.realpathSync(cwd);
    } catch {
      canonical = path.resolve(cwd);
    }
  }
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function assertSafeId(id, label) {
  if (typeof id !== 'string' || id === '' || !/^[A-Za-z0-9_.-]+$/.test(id) || id.includes('..')) {
    throw new Error(`unsafe ${label}: ${String(id)}`);
  }
  return id;
}

export function projectOverridePath(key, env = process.env) {
  return path.join(dataDir(env), 'projects', `${assertSafeId(key, 'project key')}.json`);
}

export function sessionDir(sessionId, env = process.env) {
  return path.join(dataDir(env), 'sessions', assertSafeId(sessionId, 'session id'));
}

export function sessionStatePath(sessionId, env = process.env) {
  return path.join(sessionDir(sessionId, env), 'state.json');
}

export function sessionEventsDir(sessionId, env = process.env) {
  return path.join(sessionDir(sessionId, env), 'events');
}

function isSymlink(file) {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

// Safe read: symlink targets, oversized files, and corrupt JSON all return the fallback.
export function readJsonSafe(file, fallback = null, maxBytes = STATE_FILE_MAX_BYTES) {
  try {
    if (isSymlink(file)) return fallback;
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > maxBytes) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Atomic write: temp file in the same directory + rename, mode 0600, symlink refusal, size cap.
export function writeJsonAtomic(file, obj, maxBytes = STATE_FILE_MAX_BYTES) {
  const payload = JSON.stringify(obj, null, 2);
  if (Buffer.byteLength(payload, 'utf8') > maxBytes) {
    throw new Error(`state payload exceeds size cap: ${file}`);
  }
  if (isSymlink(file)) {
    throw new Error(`refusing to write through symlink: ${file}`);
  }
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (isSymlink(dir)) {
    throw new Error(`refusing to write into symlinked directory: ${dir}`);
  }
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, payload, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// Atomic create for per-tool event files: fails if the file already exists (wx flag).
export function writeJsonExclusive(file, obj, maxBytes = STATE_FILE_MAX_BYTES) {
  const payload = JSON.stringify(obj);
  if (Buffer.byteLength(payload, 'utf8') > maxBytes) {
    throw new Error(`event payload exceeds size cap: ${file}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, payload, { mode: 0o600, flag: 'wx' });
}

// ---- project mode config ----

function userConfigDefaults(env = process.env) {
  // Claude Code exposes plugin userConfig values to command hooks via env.
  const raw = env.CLAUDE_PLUGIN_CONFIG;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const out = {};
    if (parsed.default_level !== undefined) {
      const lvl = Number(parsed.default_level);
      if ([1, 2, 3].includes(lvl)) out.level = lvl;
    }
    if (typeof parsed.novice_enabled === 'boolean') out.enabled = parsed.novice_enabled;
    return out;
  } catch {
    return {};
  }
}

// Precedence: project override in CLAUDE_PLUGIN_DATA → userConfig default → built-in Level 1.
export function getProjectConfig(cwd = process.cwd(), env = process.env) {
  const key = projectKey(cwd);
  const override = readJsonSafe(projectOverridePath(key, env), {});
  const user = userConfigDefaults(env);
  const merged = { ...BUILTIN_DEFAULTS, ...user, ...sanitizeOverride(override) };
  return { key, level: merged.level, enabled: merged.enabled, protected_branches_extra: merged.protected_branches_extra ?? [] };
}

function sanitizeOverride(override) {
  const out = {};
  if (override && typeof override === 'object') {
    if ([1, 2, 3].includes(Number(override.level))) out.level = Number(override.level);
    if (typeof override.enabled === 'boolean') out.enabled = override.enabled;
    if (Array.isArray(override.protected_branches_extra)) {
      out.protected_branches_extra = override.protected_branches_extra.filter((b) => typeof b === 'string');
    }
  }
  return out;
}

export function setProjectMode(cwd, mode, env = process.env) {
  const key = projectKey(cwd);
  const file = projectOverridePath(key, env);
  const current = sanitizeOverride(readJsonSafe(file, {}));
  let next;
  if (mode === 'off') {
    next = { ...current, enabled: false };
  } else {
    const lvl = Number(mode);
    if (![1, 2, 3].includes(lvl)) throw new Error(`invalid mode: ${mode}`);
    next = { ...current, enabled: true, level: lvl };
  }
  next.updated_at = new Date().toISOString();
  writeJsonAtomic(file, next);
  return next;
}

// ---- session state ----

export function defaultSessionState() {
  return {
    schema_version: 1,
    term_counts: {},
    reset_terms: [],
    muted_terms: [],
    last_message_hash: null,
    capsule_revision: null,
    glossary_revision: null,
    skip_next_submit: false,
    off_tombstone_emitted: false,
    updated_at: null,
  };
}

export function loadSession(sessionId, env = process.env) {
  const state = readJsonSafe(sessionStatePath(sessionId, env), null);
  if (!state || typeof state !== 'object' || state.schema_version !== 1) {
    return defaultSessionState();
  }
  return { ...defaultSessionState(), ...state };
}

export function saveSession(sessionId, state, env = process.env) {
  state.updated_at = new Date().toISOString();
  writeJsonAtomic(sessionStatePath(sessionId, env), state);
}

export function deleteSession(sessionId, env = process.env) {
  try {
    fs.rmSync(sessionDir(sessionId, env), { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

export function cleanupExpiredSessions(env = process.env, ttlMs = SESSION_TTL_MS, now = Date.now()) {
  const root = path.join(dataDir(env), 'sessions');
  let entries;
  try {
    entries = fs.readdirSync(root);
  } catch {
    return;
  }
  for (const entry of entries) {
    const dir = path.join(root, entry);
    try {
      const st = fs.lstatSync(dir);
      if (!st.isDirectory()) continue;
      if (now - st.mtimeMs > ttlMs) fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // skip entries we cannot stat
    }
  }
}
