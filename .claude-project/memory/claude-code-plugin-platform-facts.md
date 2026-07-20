---
name: claude-code-plugin-platform-facts
description: Novice 플러그인 설계에 쓰이는, 공식 문서로 검증한 Claude Code 플러그인·hook 플랫폼 사실
type: reference
created: 2026-07-20
---

출처: code.claude.com/docs (hooks.md, plugins-reference.md), 2026-07-20 doc-verification agent로 검증. PRD revision 3에 반영됨.

**Hook 필드/동작**
- `UserPromptExpansion` hook 존재. 입력 필드는 `command_name`, `command_input`, `expanded_prompt`. `command_source` 필드는 **존재하지 않음** — 플러그인 명령 판별은 namespace가 붙은 `command_name`(예: `novice:mode`)을 매칭해야 한다. invalid args를 block할 수 있는지는 **미검증**(PRD Phase 0 spike 항목).
- `Stop` hook 입력에 `last_assistant_message`(최종 assistant 텍스트 전문)가 포함됨 — transcript 파싱 불필요.
- `SessionStart` source: `startup`, `resume`, `clear`, `compact`.
- `PreToolUse`의 `permissionDecision` 값: `allow | deny | ask | defer` (`defer`는 비대화형 `-p` 모드에서 일반 권한 흐름으로 위임).

**한도**
- Hook 출력 cap: 10,000 chars.
- `UserPromptSubmit` timeout: 30s (일반 command hook 기본 600s).

**플러그인 구성/데이터**
- `${CLAUDE_PLUGIN_DATA}` 공식 존재: 플러그인 업데이트를 넘어 유지되는 영속 디렉터리. `~/.claude/plugins/data/{id}/`로 resolve.
- `plugin.json`의 `userConfig` 존재: user/managed settings에서만 읽음(프로젝트 `.claude/settings.json`의 pluginConfigs는 무시됨).
- 플러그인 skill은 항상 `/plugin-name:skill-name`으로 namespace됨. unnamespaced alias 메커니즘 없음.
- 플러그인 slash-command args를 결정론적(비-LLM)으로 처리하는 native 메커니즘 없음 — `UserPromptExpansion` hook 검증이 가장 가까운 공식 경로.

**Why:** Codex가 초안에서 잘못 단언한 필드명(예: `command_source`)을 공식 문서 대조로 잡아낸 결과다. 이 사실들이 Hook-only 단일 플러그인 아키텍처(ADR)의 근거이므로, 재확인 없이 재사용하면 잘못된 설계로 되돌아갈 수 있다.
**How to apply:** 플러그인/hook 구현·설계를 논할 때 이 목록을 기준으로 삼는다. "미검증"으로 표시된 항목(UserPromptExpansion block 가능 여부)은 사실로 가정하지 말고 Phase 0 spike로 확인한다. 문서는 변할 수 있으므로 구현 직전 [[prd-cross-review-workflow]] 방식으로 공식 문서를 재검증한다.
