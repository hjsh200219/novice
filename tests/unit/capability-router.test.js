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

test('validateMcpCandidate allowlist path rejects each failure mode with a specific reason', () => {
  const al = seededCaps().mcp_allowlist;
  assert.equal(validateMcpCandidate({ ...okCandidate(), server: 'evil' }, al).reason, 'not-in-allowlist-and-no-consent');
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

test('validateMcpCandidate user-consent path: runtime-registered + explicit consent is allowed', () => {
  // Not in the allowlist, but the user registered the server in their Claude runtime AND
  // consented to it → allowed, limited to the consented tools. Works even with empty allowlist.
  const consented = { server: 'railway', transport: 'stdio', publisher: 'railway', tools: ['status'], registered: true, userConsent: true };
  const v = validateMcpCandidate(consented, []);
  assert.equal(v.allowed, true);
  assert.equal(v.basis, 'user-consent');
  assert.deepEqual(v.tools, ['status']);
});

test('validateMcpCandidate: registration without consent, or consent without registration, is rejected', () => {
  const base = { server: 'railway', transport: 'stdio', publisher: 'railway', tools: ['status'] };
  assert.equal(validateMcpCandidate({ ...base, registered: true }, []).reason, 'registered-no-consent');
  assert.equal(validateMcpCandidate({ ...base, userConsent: true }, []).reason, 'consented-not-registered');
  assert.equal(validateMcpCandidate(base, []).reason, 'not-in-allowlist-and-no-consent');
});

test('shipped allowlist is empty → no MCP auto-runs without explicit user consent', () => {
  const caps = loadCapabilities();
  assert.deepEqual(caps.mcp_allowlist, [], 'default must be empty (safe: no MCP auto-run)');
  // A plain candidate (no consent) is rejected against the empty shipped allowlist.
  assert.equal(validateMcpCandidate(okCandidate(), caps.mcp_allowlist).allowed, false);
  // But a runtime-registered server the user consented to is allowed.
  assert.equal(
    validateMcpCandidate({ ...okCandidate(), registered: true, userConsent: true }, caps.mcp_allowlist).allowed,
    true,
  );
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

test('CLI usable via explicit user consent even when not preinstalled (Tier 2)', () => {
  const caps = seededCaps();
  const r = resolveCapability('supabase', 'bootstrap', { cliAvailable: false, cliUserConsent: true }, caps);
  assert.equal(r.path, 'cli');
});

test('CLI refused → downgrade to user-consented registered MCP (empty allowlist)', () => {
  const caps = seededCaps();
  caps.mcp_allowlist = []; // no static allowlist; rely on user consent
  const r = resolveCapability(
    'railway',
    'bootstrap',
    {
      cliRefusedOrFailed: true,
      mcpCandidate: { server: 'railway', transport: 'stdio', publisher: 'railway', tools: ['status'], registered: true, userConsent: true },
    },
    caps,
  );
  assert.equal(r.path, 'mcp');
  assert.equal(r.detail.basis, 'user-consent');
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
  assert.equal(mcpStep.reason, 'not-in-allowlist-and-no-consent');
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
