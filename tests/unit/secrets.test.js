import test from 'node:test';
import assert from 'node:assert/strict';
import { scanText, redactText, shannonEntropy, isPlaceholderValue, loadSafetyRules } from '../../scripts/lib/secrets.js';

// Synthetic, non-real credentials shaped to match each pattern.
const SAMPLES = {
  'aws-access-key-id': 'AKIA' + 'ABCDEFGHIJKLMNOP',
  'aws-secret-access-key': 'aws_secret_access_key = "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789/+ab"',
  'github-token': 'ghp_' + 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0dF3gH6jK9m',
  'github-fine-grained-pat': 'github_pat_' + '11ABCDEFG0_aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0dF3gH6jK9mN2pQ5sT8v',
  'slack-token': 'xoxb-' + '123456789012-ABCDEFGHIJKLMNOPQRSTUVWX',
  'stripe-secret-key': 'sk_live_' + 'aB3dE6gH9jK2mN5pQ8sT1vW4',
  'openai-api-key': 'sk-aB3dE6gH9jK2mN5pQ8sT' + 'T3BlbkFJ' + 'aB3dE6gH9jK2mN5pQ8sT',
  'anthropic-api-key': 'sk-ant-' + 'api03-aB3dE6gH9jK2mN5pQ8sT1vW4yZ7b',
  'google-api-key': 'AIza' + 'SyA1bC2dE3fG4hI5jK6lM7nO8pQ9rS0tU1v',
  'private-key-block': '-----BEGIN RSA PRIVATE KEY-----',
  'jwt': 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  'generic-assignment': 'api_key = "qZ8xV3nM7kL2wR9tY6uP1sD4fG5hJ0aB"',
};

test('every secret pattern id detects its synthetic sample', () => {
  for (const [id, sample] of Object.entries(SAMPLES)) {
    const findings = scanText(`prefix ${sample} suffix`);
    assert.ok(findings.some((f) => f.id === id), `${id} not detected in: ${sample}`);
  }
});

test('findings carry positions and ids only — never matched content', () => {
  const findings = scanText(SAMPLES['github-token']);
  for (const f of findings) {
    assert.deepEqual(Object.keys(f).sort(), ['id', 'index', 'length']);
  }
});

test('placeholders and low-entropy values are not flagged by the entropy-gated pattern', () => {
  const benign = [
    'api_key = "your-api-key-goes-here-please"',
    'secret = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"',
    'password = "example_password_for_docs_1"',
    'token = "PLACEHOLDER_TOKEN_VALUE_HERE"',
    'api_key = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
  ];
  for (const line of benign) {
    const findings = scanText(line).filter((f) => f.id === 'generic-assignment');
    assert.equal(findings.length, 0, `false positive on: ${line}`);
  }
});

test('shannonEntropy sanity', () => {
  assert.ok(shannonEntropy('aaaaaaaaaa') < 1);
  assert.ok(shannonEntropy('qZ8xV3nM7kL2wR9tY6uP') > 3.5);
});

test('isPlaceholderValue recognizes fixture markers', () => {
  assert.equal(isPlaceholderValue('example-token-abcdefgh'), true);
  assert.equal(isPlaceholderValue('<YOUR_API_KEY>'), true);
  assert.equal(isPlaceholderValue('${API_KEY}'), true);
  assert.equal(isPlaceholderValue('qZ8xV3nM7kL2wR9tY6uP1sD4'), false);
});

test('redactText replaces matches with [REDACTED:id] and drops the original bytes', () => {
  const input = `before ${SAMPLES['github-token']} after ${SAMPLES['aws-access-key-id']} end`;
  const { text, count, ids } = redactText(input);
  assert.ok(count >= 2);
  assert.ok(text.includes('[REDACTED:github-token]'));
  assert.ok(text.includes('[REDACTED:aws-access-key-id]'));
  assert.ok(!text.includes(SAMPLES['github-token']));
  assert.ok(!text.includes(SAMPLES['aws-access-key-id']));
  assert.ok(text.startsWith('before ') && text.endsWith(' end'), 'non-secret content preserved');
  assert.ok(ids.includes('github-token'));
});

test('clean text passes through untouched', () => {
  const clean = 'git status shows 2 modified files; npm test passed with 40 assertions.';
  const { text, count } = redactText(clean);
  assert.equal(count, 0);
  assert.equal(text, clean);
});

test('rules load once and expose caps used by the gate', () => {
  const rules = loadSafetyRules();
  assert.equal(rules.input_caps.command_bytes, 65536);
  assert.ok(Array.isArray(rules.scan_path_skip) && rules.scan_path_skip.includes('tests/fixtures/'));
});
