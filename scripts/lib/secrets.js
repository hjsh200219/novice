// Known-secret scanner shared by the PreToolUse gate and PostToolUse redaction.
// Candidate bytes are inspected in process memory only; raw matches are never
// returned, logged, or persisted — callers only see pattern ids and positions.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function pluginRoot(env = process.env) {
  const fromEnv = env.CLAUDE_PLUGIN_ROOT;
  if (fromEnv && fromEnv.trim() !== '') return fromEnv;
  return path.resolve(HERE, '..', '..');
}

let cachedRules = null;
export function loadSafetyRules(env = process.env) {
  if (cachedRules) return cachedRules;
  const file = path.join(pluginRoot(env), 'config', 'safety-rules.json');
  cachedRules = JSON.parse(fs.readFileSync(file, 'utf8'));
  return cachedRules;
}

function compilePattern(spec) {
  const inlineCaseInsensitive = spec.pattern.startsWith('(?i)');
  const source = spec.pattern.replace(/^\(\?i\)/, '');
  return {
    id: spec.id,
    description: spec.description,
    entropyCheck: spec.entropy_check === true,
    regex: new RegExp(source, inlineCaseInsensitive ? 'gi' : 'g'),
  };
}

let cachedCompiled = null;
export function compiledSecretPatterns(rules = loadSafetyRules()) {
  if (cachedCompiled) return cachedCompiled;
  cachedCompiled = rules.secret_patterns.map(compilePattern);
  return cachedCompiled;
}

export function shannonEntropy(str) {
  if (!str || str.length === 0) return 0;
  const freq = new Map();
  for (const ch of str) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

let cachedPlaceholders = null;
function placeholderRegexes(rules) {
  if (!cachedPlaceholders) {
    cachedPlaceholders = rules.entropy.placeholder_allowlist.map((p) => {
      const inlineCaseInsensitive = p.startsWith('(?i)');
      return new RegExp(p.replace(/^\(\?i\)/, ''), inlineCaseInsensitive ? 'i' : '');
    });
  }
  return cachedPlaceholders;
}

export function isPlaceholderValue(value, rules = loadSafetyRules()) {
  return placeholderRegexes(rules).some((re) => re.test(value));
}

// Scan text for known secret patterns.
// Returns findings without the matched secret content: [{ id, index, length }].
export function scanText(text, rules = loadSafetyRules()) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const findings = [];
  for (const pattern of compiledSecretPatterns(rules)) {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      const candidate = match[1] ?? match[0];
      if (pattern.entropyCheck) {
        if (candidate.length < rules.entropy.min_length) continue;
        if (isPlaceholderValue(candidate, rules)) continue;
        if (shannonEntropy(candidate) < rules.entropy.shannon_threshold) continue;
      }
      findings.push({ id: pattern.id, index: match.index, length: match[0].length });
      if (match.index === pattern.regex.lastIndex) pattern.regex.lastIndex++;
    }
  }
  return findings.sort((a, b) => a.index - b.index);
}

// Replace every finding with a marker. Returns redacted text and finding ids only.
export function redactText(text, rules = loadSafetyRules()) {
  const findings = scanText(text, rules);
  if (findings.length === 0) return { text, count: 0, ids: [] };
  let out = '';
  let cursor = 0;
  for (const f of findings) {
    if (f.index < cursor) continue; // overlapping match already covered
    out += text.slice(cursor, f.index) + `[REDACTED:${f.id}]`;
    cursor = f.index + f.length;
  }
  out += text.slice(cursor);
  return { text: out, count: findings.length, ids: [...new Set(findings.map((f) => f.id))] };
}
