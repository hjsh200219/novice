#!/usr/bin/env node
// PostToolUse: redacts known secret patterns out of Bash/MCP tool output before it
// reaches the model, and records a success fingerprint event for cost/repeat-loop
// detection. This hook never writes shared session state directly — it only
// atomic-creates an event file that PostToolBatch later aggregates and deletes.
// It fails open on any internal error: it must never block the tool call.
import path from 'node:path';
import { readStdinJson, emit, failOpen } from './lib/hookio.js';
import { sessionEventsDir, writeJsonExclusive } from './lib/state.js';
import { scanText, redactText } from './lib/secrets.js';
import { computeFingerprint, TOOL_USE_ID_RE } from './lib/fingerprint.js';

const FULL_REDACTION_FALLBACK = '[novice: 출력에 비밀값 패턴이 감지되어 전체를 가렸습니다]';

// Extract candidate text fields from the tool_response shapes the harness uses:
// a bare string, {output}, {stdout}/{stderr}, or MCP-style {content:[{type:"text",text}]}.
// path === null means the whole response IS the text (bare string case).
function extractTextFields(toolResponse) {
  const fields = [];
  if (typeof toolResponse === 'string') {
    fields.push({ path: null, value: toolResponse });
    return fields;
  }
  if (toolResponse && typeof toolResponse === 'object' && !Array.isArray(toolResponse)) {
    if (typeof toolResponse.output === 'string') fields.push({ path: ['output'], value: toolResponse.output });
    if (typeof toolResponse.stdout === 'string') fields.push({ path: ['stdout'], value: toolResponse.stdout });
    if (typeof toolResponse.stderr === 'string') fields.push({ path: ['stderr'], value: toolResponse.stderr });
    if (Array.isArray(toolResponse.content)) {
      toolResponse.content.forEach((item, idx) => {
        if (item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string') {
          fields.push({ path: ['content', idx], value: item.text });
        }
      });
    }
  }
  return fields;
}

// Rebuild tool_response with each text field redacted, preserving the original
// structure as closely as possible (string in -> string out, object in -> same
// object shape with text fields replaced).
function applyRedactedFields(toolResponse, fields) {
  if (fields.length === 1 && fields[0].path === null) {
    return redactText(fields[0].value).text;
  }
  const clone = { ...toolResponse };
  if (Array.isArray(toolResponse.content)) clone.content = toolResponse.content.slice();
  for (const f of fields) {
    const redacted = redactText(f.value).text;
    if (f.path[0] === 'content') {
      const idx = f.path[1];
      clone.content[idx] = { ...clone.content[idx], text: redacted };
    } else {
      clone[f.path[0]] = redacted;
    }
  }
  return clone;
}

function main() {
  let input;
  try {
    input = readStdinJson();
  } catch {
    failOpen();
    return;
  }

  // (a) Redaction — only touches output text, never logs the original anywhere.
  try {
    const fields = extractTextFields(input.tool_response);
    const scanView = fields.map((f) => f.value).join('\n');
    if (scanView.length > 0) {
      const findings = scanText(scanView);
      if (findings.length > 0) {
        let updatedToolOutput;
        try {
          updatedToolOutput = applyRedactedFields(input.tool_response, fields);
        } catch {
          // Secrets were confirmed present (pre-scan found candidates) but
          // structured redaction failed — never let the original leak through.
          updatedToolOutput = FULL_REDACTION_FALLBACK;
        }
        emit({ hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput } });
      }
    }
  } catch {
    // Could not even determine whether secrets are present (extraction/scan
    // itself failed). No pre-scan hit was confirmed, so fail open silently.
  }

  // (b) Fingerprint event — best-effort, independent of the redaction outcome.
  try {
    const { session_id: sessionId, tool_name: toolName, tool_input: toolInput, tool_use_id: toolUseId } = input;
    if (typeof sessionId === 'string' && sessionId !== '' && typeof toolUseId === 'string' && TOOL_USE_ID_RE.test(toolUseId)) {
      const file = path.join(sessionEventsDir(sessionId), `${toolUseId}.json`);
      writeJsonExclusive(file, {
        schema_version: 1,
        tool_use_id: toolUseId,
        tool_name: toolName,
        status: 'success',
        fingerprint: computeFingerprint(toolName, toolInput),
        ts: Date.now(),
      });
    }
  } catch {
    // EEXIST (duplicate delivery) or any other issue — event write is best-effort
    // observation and must never crash or block the tool.
  }

  process.exit(0);
}

main();
