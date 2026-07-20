import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

test('plugin.json declares novice with userConfig defaults', () => {
  const plugin = readJson('.claude-plugin/plugin.json');
  assert.equal(plugin.name, 'novice');
  assert.equal(plugin.userConfig.default_level.default, 1);
  assert.equal(plugin.userConfig.novice_enabled.default, true);
});

test('hooks.json registers all nine hook events with node scripts', () => {
  const hooks = readJson('hooks/hooks.json').hooks;
  const expected = [
    'SessionStart', 'UserPromptSubmit', 'UserPromptExpansion', 'PreToolUse',
    'PostToolUse', 'PostToolUseFailure', 'PostToolBatch', 'Stop', 'SessionEnd',
  ];
  for (const event of expected) {
    assert.ok(Array.isArray(hooks[event]) && hooks[event].length > 0, `missing hook: ${event}`);
    const command = hooks[event][0].hooks[0].command;
    assert.match(command, /node ".*\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/[a-z-]+\.js"|node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/[a-z-]+\.js"/);
    const script = command.match(/scripts\/([a-z-]+\.js)/)[1];
    assert.ok(fs.existsSync(path.join(root, 'scripts', script)), `script missing on disk: ${script}`);
  }
});

test('terms.json has exactly 32 terms with required category distribution', () => {
  const { terms } = readJson('config/terms.json');
  assert.equal(terms.length, 32);
  const byCategory = {};
  for (const t of terms) {
    assert.ok(typeof t.term === 'string' && t.term.length > 0);
    assert.ok(typeof t.explanation === 'string' && t.explanation.length > 0);
    assert.ok(Array.isArray(t.aliases));
    assert.ok(typeof t.category === 'string');
    byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
  }
  assert.deepEqual(byCategory, { git: 8, terminal: 6, web: 6, database: 6, deploy: 6 });
});

test('terms are unique across term names and aliases', () => {
  const { terms } = readJson('config/terms.json');
  const seen = new Set();
  for (const t of terms) {
    for (const name of [t.term.toLowerCase(), ...t.aliases.map((a) => a.toLowerCase())]) {
      assert.ok(!seen.has(name), `duplicate term/alias: ${name}`);
      seen.add(name);
    }
  }
});

test('levels.json defines fade thresholds 3/1/0 and payload caps', () => {
  const levels = readJson('config/levels.json');
  assert.equal(levels.default_level, 1);
  assert.equal(levels.levels['1'].fade_threshold, 3);
  assert.equal(levels.levels['2'].fade_threshold, 1);
  assert.equal(levels.levels['3'].fade_threshold, 0);
  assert.equal(levels.capsule_max_chars, 800);
  assert.equal(levels.tombstone_max_chars, 300);
  assert.equal(levels.glossary_max_chars, 5000);
});

test('safety-rules.json defines caps, protected branches, and valid secret regexes', () => {
  const rules = readJson('config/safety-rules.json');
  assert.equal(rules.input_caps.command_bytes, 64 * 1024);
  assert.equal(rules.input_caps.single_file_bytes, 1024 * 1024);
  assert.equal(rules.input_caps.total_candidate_bytes, 5 * 1024 * 1024);
  assert.deepEqual(rules.protected_branches.builtin, ['main', 'master', 'production', 'release/*']);
  assert.equal(rules.protected_branches.override_policy, 'add-only');
  assert.ok(rules.secret_patterns.length >= 10);
  for (const p of rules.secret_patterns) {
    assert.ok(p.id && p.pattern && p.description, `secret pattern incomplete: ${p.id}`);
    // Patterns may carry an inline (?i) flag marker — strip it for RegExp construction the same
    // way the scanner does.
    const flags = p.pattern.startsWith('(?i)') ? 'i' : '';
    const source = p.pattern.replace(/^\(\?i\)/, '');
    assert.doesNotThrow(() => new RegExp(source, flags), `invalid regex: ${p.id}`);
  }
  assert.ok(rules.entropy.min_length >= 16);
  assert.ok(rules.entropy.shannon_threshold > 0);
});

test('service-capabilities.json orders CLI > MCP > Chrome > guided manual', () => {
  const caps = readJson('config/service-capabilities.json');
  assert.deepEqual(caps.capability_priority, ['cli', 'mcp', 'chrome', 'guided_manual']);
  for (const svc of Object.values(caps.services)) {
    assert.ok(fs.existsSync(path.join(root, 'config', svc.manifest)), `manifest missing: ${svc.manifest}`);
  }
});

const MANIFEST_REQUIRED = [
  'service_id', 'binary', 'docs_url', 'installers', 'detect', 'version_check',
  'auth_status', 'login', 'logout', 'credential_store', 'uninstall', 'side_effects',
  'noninteractive_policy',
];

for (const name of ['vercel', 'github-cli', 'supabase']) {
  test(`bootstrap manifest ${name} carries the full contract`, () => {
    const manifest = readJson(`config/bootstrap-manifests/${name}.json`);
    for (const field of MANIFEST_REQUIRED) {
      assert.ok(manifest[field] !== undefined, `${name}: missing ${field}`);
    }
    assert.ok(Array.isArray(manifest.installers) && manifest.installers.length > 0);
    for (const inst of manifest.installers) {
      assert.ok(Array.isArray(inst.argv) && inst.argv.length > 0, `${name}: installer argv must be exec-form`);
      assert.ok(inst.package_coordinate, `${name}: installer needs fixed package coordinate`);
      // No shell strings, no curl|bash.
      for (const token of inst.argv) {
        assert.ok(!/[|;&><`]/.test(token), `${name}: shell metacharacter in argv token: ${token}`);
        assert.notEqual(token, 'curl');
        assert.notEqual(token, 'sh');
        assert.notEqual(token, 'bash');
      }
    }
    assert.ok(Array.isArray(manifest.detect.argv));
    assert.ok(manifest.login.interactive === true, `${name}: login must be marked interactive`);
    assert.ok(typeof manifest.credential_store.abort_auto_login_on_plaintext === 'boolean');
    assert.ok(['guided_manual', 'deny'].includes(manifest.noninteractive_policy.login));
    assert.equal(manifest.tier, 1);
    assert.ok(manifest.manifest_revision >= 1);
    assert.ok(manifest.reviewed_at, `${name}: manifest must carry review date`);
  });
}
