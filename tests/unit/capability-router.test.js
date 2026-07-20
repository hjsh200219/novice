import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMcpCandidate, chromeDecision, resolveCapability, planCapability, loadCapabilities,
} from '../../scripts/lib/capability-router.js';

// A seeded capabilities object so tests never depend on the shipped empty allowlist.
function seededCaps() {
  return {
    schema_version: 1,
    capability_priority: ['cli', 'mcp', 'chrome', 'guided_manual'],
    mcp_allowlist: [
      {
        service_id: 'supabase',
        server: 'supabase',
        transport: 'stdio',
        publisher: 'supabase',
        docs_url: 'https://supabase.com/docs',
        tools: ['list_projects', 'get_project'],
        capabilities: ['bootstrap'],
      },
    ],
    chrome_policy: { mode: 'visible-only', user_completes: ['login', 'captcha', 'mfa', 'final-submit'] },
    services: {
      supabase: { capabilities: { bootstrap: 'cli', provisioning: 'guided_manual' } },
      vercel: { capabilities: { bootstrap: 'cli', deploy: 'guided_manual' } },
    },
  };
}

const okCandidate = () => ({
  service_id: 'supabase',
  server: 'supabase',
  transport: 'stdio',
  publisher: 'supabase',
  tools: ['list_projects'],
  provenance: { verified: true },
});

// ---- MCP allowlist validation ----

test('validateMcpCandidate: allowlisted, verified, in-scope candidate is allowed', () => {
  const caps = seededCaps();
  const v = validateMcpCandidate(okCandidate(), caps.mcp_allowlist, 'bootstrap');
  assert.equal(v.allowed, true);
  assert.deepEqual(v.tools, ['list_projects']);
});

test('validateMcpCandidate rejects each failure mode with a specific reason', () => {
  const al = seededCaps().mcp_allowlist;
  assert.equal(validateMcpCandidate(okCandidate(), [], 'bootstrap').reason, 'allowlist-empty');
  assert.equal(validateMcpCandidate({ ...okCandidate(), server: 'evil' }, al).reason, 'not-in-allowlist');
  assert.equal(validateMcpCandidate({ ...okCandidate(), transport: 'http' }, al).reason, 'transport-mismatch');
  assert.equal(validateMcpCandidate({ ...okCandidate(), publisher: 'attacker' }, al).reason, 'publisher-mismatch');
  assert.equal(
    validateMcpCandidate({ ...okCandidate(), provenance: { verified: false } }, al).reason,
    'provenance-unverified',
  );
  assert.match(
    validateMcpCandidate({ ...okCandidate(), tools: ['delete_project'] }, al).reason,
    /^tool-not-allowlisted:delete_project$/,
  );
  assert.equal(
    validateMcpCandidate(okCandidate(), al, 'deploy').reason,
    'capability-not-served',
  );
});

test('shipped allowlist is empty → nothing auto-runs via MCP', () => {
  const caps = loadCapabilities();
  assert.deepEqual(caps.mcp_allowlist, [], 'default must be empty (safe: no MCP auto-run)');
  assert.equal(validateMcpCandidate(okCandidate(), caps.mcp_allowlist).allowed, false);
});

// ---- Chrome availability ----

test('chromeDecision: usable only for connected official Chrome, not third-party', () => {
  const policy = seededCaps().chrome_policy;
  assert.equal(chromeDecision(null, policy).usable, false);
  assert.equal(chromeDecision({ available: false }, policy).usable, false);
  assert.equal(chromeDecision({ available: true, thirdPartyProvider: true }, policy).reason, 'third-party-provider');
  const ok = chromeDecision({ available: true }, policy);
  assert.equal(ok.usable, true);
  assert.equal(ok.mode, 'visible-only');
  assert.deepEqual(ok.user_completes, ['login', 'captcha', 'mfa', 'final-submit']);
});

// ---- path resolution / downgrade chain ----

test('CLI available → path cli', () => {
  const caps = seededCaps();
  const r = resolveCapability('supabase', 'bootstrap', { cliAvailable: true }, caps);
  assert.equal(r.path, 'cli');
});

test('CLI refused → downgrade to allowlisted MCP', () => {
  const caps = seededCaps();
  const r = resolveCapability(
    'supabase',
    'bootstrap',
    { cliAvailable: false, cliRefusedOrFailed: true, mcpCandidate: okCandidate() },
    caps,
  );
  assert.equal(r.path, 'mcp');
  assert.equal(r.detail.entry.server, 'supabase');
});

test('CLI refused, no valid MCP, Chrome available → chrome', () => {
  const caps = seededCaps();
  const r = resolveCapability(
    'supabase',
    'bootstrap',
    { cliRefusedOrFailed: true, mcpCandidate: null, chromeEnv: { available: true } },
    caps,
  );
  assert.equal(r.path, 'chrome');
});

test('CLI refused, no MCP, no Chrome → guided_manual (terminal fallback)', () => {
  const caps = seededCaps();
  const r = resolveCapability(
    'supabase',
    'bootstrap',
    { cliRefusedOrFailed: true, chromeEnv: { available: false } },
    caps,
  );
  assert.equal(r.path, 'guided_manual');
  assert.ok(r.ordered.every((o) => o.path !== 'guided_manual' || o.usable));
});

test('non-allowlisted MCP candidate is skipped in the chain', () => {
  const caps = seededCaps();
  const r = resolveCapability(
    'supabase',
    'bootstrap',
    { cliRefusedOrFailed: true, mcpCandidate: { ...okCandidate(), server: 'rogue' }, chromeEnv: { available: true } },
    caps,
  );
  assert.equal(r.path, 'chrome', 'rogue MCP must not be chosen');
  const mcpStep = r.ordered.find((o) => o.path === 'mcp');
  assert.equal(mcpStep.usable, false);
  assert.equal(mcpStep.reason, 'not-in-allowlist');
});

test('pinned guided_manual capability skips straight to guided_manual even if CLI available', () => {
  const caps = seededCaps();
  const r = resolveCapability('vercel', 'deploy', { cliAvailable: true }, caps);
  assert.equal(r.path, 'guided_manual');
  // cli/mcp/chrome are before the start index → not even attempted.
  assert.equal(r.ordered.length, 1);
  assert.equal(r.ordered[0].path, 'guided_manual');
});

test('planCapability produces Korean guidance and lists skipped paths', () => {
  const caps = seededCaps();
  const p = planCapability(
    'supabase',
    'bootstrap',
    { cliRefusedOrFailed: true, mcpCandidate: okCandidate() },
    caps,
  );
  assert.equal(p.path, 'mcp');
  assert.match(p.guidance, /MCP/);
  assert.ok(p.skipped.some((s) => s.startsWith('cli(')));
});
