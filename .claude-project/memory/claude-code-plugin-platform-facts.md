---
name: claude-code-plugin-platform-facts
description: SDK 타입 정의로 확정한 Claude Code 플러그인·hook 플랫폼 사실 (교차 리뷰 분쟁 해소본)
type: reference
created: 2026-07-20
---

출처 우선순위: `@anthropic-ai/claude-agent-sdk` v0.2.117 `sdk.d.ts` 타입 정의(확정) > code.claude.com/docs. 2026-07-20 3차 검증 — 1차(claude 문서 대조)와 2차(codex 적대적 리뷰)가 서로 모순되는 주장을 해서 SDK 타입으로 판정함. PRD revision 5에 반영됨.

**Hook 필드/동작 (SDK 타입으로 확정)**
- `UserPromptExpansion` 입력: `expansion_type('slash_command'|'mcp_prompt')`, `command_name`, `command_args`, `command_source?`(optional), `prompt`. (1차 검증의 `command_input`/`expanded_prompt`는 오염된 사실이었음.)
- `UserPromptExpansion` 출력: `additionalContext`뿐. **expansion 차단(decision:block) 불가능** — codex의 block 주장은 오류. invalid args는 state 미변경 + additionalContext 안내로 처리해야 함.
- `Stop` 입력에 `last_assistant_message?` 포함 — **optional**이므로 부재 처리 필수. transcript 파싱 불필요.
- `PostToolUseFailure` 존재: `tool_name`, `tool_input`, `tool_use_id`, `error`, `is_interrupt?`.
- **`PostToolBatch`는 존재하지 않음** (codex 창작). 병렬 tool 집계는 `PostToolUse`/`PostToolUseFailure` per-call + atomic single-writer로.
- `PostToolUse` 출력: `additionalContext?` + `updatedMCPToolOutput?` — output 대체는 **MCP tool 전용**. Bash로 도는 CLI stdout은 redaction 불가.
- 전체 hook 이벤트(SDK v0.2.117): PreToolUse, PostToolUse, PostToolUseFailure, Notification, UserPromptSubmit, UserPromptExpansion, SessionStart, SessionEnd, Stop, StopFailure, SubagentStart, SubagentStop, PreCompact, PostCompact, PermissionRequest, PermissionDenied, Setup, TeammateIdle, TaskCreated, TaskCompleted, Elicitation, ElicitationResult, ConfigChange, WorktreeCreate, WorktreeRemove, InstructionsLoaded, CwdChanged, FileChanged.
- `SessionStart` source: `startup`, `resume`, `clear`, `compact`.
- `PreToolUse` `permissionDecision`: `allow | deny | ask | defer`. `defer` 의미는 1·2차 검증이 상충해 **미확정** — PRD는 defer 미사용으로 결정.
- hook exit 2는 차단, 그 외 오류·timeout은 대부분 non-blocking. 안전 hook은 입력 상한 검사 + 내부 오류의 exit 2 변환 필요.

**한도**
- Hook 출력 cap: 10,000 chars.
- `UserPromptSubmit` timeout: 30s (일반 command hook 기본 600s).

**플러그인 구성/데이터**
- `${CLAUDE_PLUGIN_DATA}` 공식 존재: 플러그인 업데이트를 넘어 유지되는 영속 디렉터리. `~/.claude/plugins/data/{id}/`로 resolve.
- `plugin.json`의 `userConfig` 존재: user/managed settings에서만 읽음(프로젝트 `.claude/settings.json`의 pluginConfigs는 무시됨).
- 플러그인 skill은 항상 `/plugin-name:skill-name`으로 namespace됨. unnamespaced alias 메커니즘 없음.
- 플러그인 slash-command args를 결정론적(비-LLM)으로 처리하는 native 메커니즘 없음 — `UserPromptExpansion` hook이 가장 가까운 공식 경로(단, 차단은 불가).

**Why:** 1차(claude)·2차(codex) 검증이 각각 다른 항목에서 틀렸다(1차: UserPromptExpansion 필드명 / 2차: decision:block, PostToolBatch). LLM 문서 검증은 단일 출처를 신뢰하지 말고 SDK 타입 정의 같은 기계 산출물로 판정해야 한다.
**How to apply:** 플러그인/hook 구현·설계를 논할 때 이 목록을 기준으로 삼되, release 직전 설치 버전의 실제 payload fixture로 재확인한다. [[prd-cross-review-workflow]] 참조.
