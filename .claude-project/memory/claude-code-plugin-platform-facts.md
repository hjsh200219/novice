---
name: claude-code-plugin-platform-facts
description: 설치 runtime 바이너리(2.1.215) grep으로 확정한 Claude Code 플러그인·hook 플랫폼 사실 (3차 판정 뒤집힘 반영)
type: reference
created: 2026-07-20
---

출처 우선순위 (2026-07-20 4차 검증으로 확정): **설치된 runtime 바이너리 직접 확인** (`strings ~/.local/share/claude/versions/2.1.215 | grep …`) > 공식 docs > Agent SDK 타입 snapshot. SDK v0.2.117 `sdk.d.ts`는 runtime 2.1.215보다 **낡아서** 3차 판정(rev5)이 틀렸었음. PRD revision 7 기준 사실은 아래와 같다.

**Hook 필드/동작 (runtime 2.1.215 바이너리로 확정)**
- `UserPromptExpansion` 입력: "Input to command is JSON with expansion_type, command_name, command_args, command_source, and original prompt." (바이너리 원문). **block 가능** — "blocked by UserPromptExpansion hook" 처리 경로 실존. rev5의 "차단 불가" 판정은 낡은 SDK 기반 오류였음. `additionalContext` 주입도 지원.
- `PostToolBatch` **실존**: "Fired once after every tool call in a batch has resolved, before the next model request. PostToolUse fires per-tool and may run concurrently for parallel tool calls; PostToolBatch fires exactly once with the full batch." (바이너리 원문). block도 가능("Execution stopped by PostToolBatch hook").
- `PostToolUse` 출력: `updatedToolOutput` — "Replaces the tool output before it is sent to the model", **모든 tool에 적용**. `updatedMCPToolOutput`은 MCP 전용 legacy ("Prefer updatedToolOutput, which works for all tools").
- `PostToolUseFailure` 실존. `Stop.last_assistant_message`(optional)·`stop_hook_active` 실존.
- skill frontmatter `disable-model-invocation` 실존.
- `SessionStart` source: startup/resume/clear/compact. hook 출력 cap 10,000자, `UserPromptSubmit` timeout 30s.
- 기타 이벤트 (2.1.215): PreCompact, PostCompact, Elicitation, ElicitationResult, MessageDisplay, ConfigChange, InstructionsLoaded, Worktree*, CwdChanged, FileChanged, SubagentStart/Stop, StopFailure 등.

**플러그인 구성/데이터 (변동 없음)**
- `${CLAUDE_PLUGIN_DATA}` 영속 디렉터리(`~/.claude/plugins/data/{id}/`), `plugin.json` `userConfig`(user/managed settings만), skill namespace 강제(`/plugin:skill`).

**검증 방법 (재사용)**
```
strings -n 8 ~/.local/share/claude/versions/$(claude --version | cut -d' ' -f1) > /tmp/cc-strings.txt
grep -n "<identifier>" /tmp/cc-strings.txt
```

**Why:** 검증 4라운드 역사 — 1차(claude 문서 대조): 필드명 틀림. 2차(codex 문서 인용): 당시 옳았으나 근거 제시 실패. 3차(SDK 타입): snapshot이 runtime보다 낡아 오판. 4차(runtime 바이너리): 확정. **문서도 SDK 타입도 runtime을 못 따라간다. 플랫폼 사실 분쟁은 설치된 바이너리 grep 또는 실측 fixture로만 판정할 것.**
**How to apply:** 플러그인/hook 설계·구현 시 이 목록 기준. release 전 위 검증 방법으로 해당 버전 재확인. [[prd-cross-review-workflow]] 참조.
