---
name: claude-code-plugin-platform-facts
description: 설치 runtime 바이너리(2.1.215) grep·live 캡처로 확정한 Claude Code 플러그인·hook 플랫폼 사실 + 설치 채널(공식 문서 조사, 미실측)
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

**실측 계약 델타 (5차: live headless capture, 2026-07-20 — 로컬 runtime == pinned 2.1.215)**
바이너리 grep으로 못 잡던 payload/검증 세부는 실제 캡처로 확정됨. 캡처 방법은 [[hook-payload-capture-method]].
- `plugin.json` `userConfig` 각 항목에 **`title` 필수** — 없으면 `claude plugins validate` 실패. (문서/바이너리엔 없던 강제 요건)
- `PostToolBatch` payload 키 = **`tool_calls[]`** (`batch[]` 아님).
- `UserPromptExpansion.command_source` 값 = 리터럴 **`"plugin"`** (플러그인 이름이 아님).
- 공통 `prompt_id` 존재. `Stop`에 `background_tasks`/`session_crons`. `PostToolUse.tool_response` = `{stdout, stderr, interrupted, isImage, noOutputExpected}` + `duration_ms`. `PostToolUseFailure`에 `error`/`is_interrupt`.
- `--plugin-dir <plugin>`로 로드 시 project override가 `~/.claude/plugins/data/<plugin>/` (파일 0600 / 디렉터리 0700)에 기록되고 `${CLAUDE_PLUGIN_DATA}`가 이를 가리킴. E2E 확인: `/novice:mode 2` → expansion hook → override {level:2} → 모델 출력에 capsule 반영.
- **headless로 캡처 불가**(문서 기반 fixture로만 유지): `SessionStart` clear/compact source, MCP 파괴적 payload.

**설치/배포 실측 (6차, 2026-07-20 — 실제 marketplace 설치)**
- `plugin.json`에 **`hooks` 키를 넣으면 안 됨** — `hooks/hooks.json`은 표준 경로로 자동 로드된다. manifest에서 같은 파일을 또 가리키면 `plugins list`에서 `Duplicate hooks file detected` 로드 실패(Status: ✘ failed to load). `--plugin-dir`로는 안 드러나고 실제 설치해야 잡힘.
- marketplace `name`에 **슬래시 불가** (`Marketplace name cannot contain path separators`). add 참조(`owner/repo`, 예 `hjsh200219/novice`)와 내부 name(슬러그, 예 `novice`)은 별개.
- **bare-name 설치 가능**: `/plugin marketplace add owner/repo` 후 `/plugin install <name>` (이름 유일하면 `@marketplace` 생략). 내부적으로 `name@marketplace`로 해석.
- 설치 시 `--config KEY=VALUE`로 userConfig 지정. 미지정 시 "N userConfig options not yet set" 경고.
- hook/skill은 **새 세션부터** 로드됨 (설치 세션엔 미반영).

**설치 채널 (7차, 2026-07-21 — 공식 문서 조사, 바이너리 미실측 주의)**
아래는 docs 기반이라 6차까지의 실측 사실과 신뢰 등급이 다르다. README 설치 절(한/영)에 커밋 8dea032로 반영됨.
- `marketplace add`는 GitHub shorthand(`owner/repo`) 외에도 **git URL**(`.git` suffix, GitLab/사설 저장소 포함, `#ref`로 브랜치/태그 지정)과 **로컬 디렉터리/marketplace.json 경로**를 모두 받는다.
- **팀 배포 SSOT** = 프로젝트 `.claude/settings.json`의 `extraKnownMarketplaces`(marketplace 등록) + `enabledPlugins`(예: `"novice@novice": true`). 리포를 신뢰한 팀원에게 자동 설치가 제안된다.
- `claude --plugin-dir <경로>` / `claude --plugin-url <ZIP URL>`은 **세션 한정 로드**이지 영구 설치가 아니다. 개발/테스트·CI artifact 검증용. (payload 캡처에 `--plugin-dir`를 쓰는 이유도 이 세션 격리성 — [[hook-payload-capture-method]])
- 컨테이너/CI 사전 주입: `CLAUDE_CODE_PLUGIN_CACHE_DIR`(이미지 빌드 시 캐시 시드) + `CLAUDE_CODE_PLUGIN_SEED_DIR`(런타임).
- `~/.claude/skills/`에 수동 복사하면 **skill만 로드되고 hook은 로드되지 않는다**. novice처럼 hook 기반 플러그인엔 부적합 — 플러그인 설치 또는 `--plugin-dir` 로드여야 안전 게이트가 산다.

**검증 방법 (재사용)**
```
strings -n 8 ~/.local/share/claude/versions/$(claude --version | cut -d' ' -f1) > /tmp/cc-strings.txt
grep -n "<identifier>" /tmp/cc-strings.txt
```

**Why:** 검증 5라운드 역사 — 1차(claude 문서 대조): 필드명 틀림. 2차(codex 문서 인용): 당시 옳았으나 근거 제시 실패. 3차(SDK 타입): snapshot이 runtime보다 낡아 오판. 4차(runtime 바이너리): hook 이벤트/필드 확정. 5차(live headless capture): payload 키·검증 강제 요건까지 확정. **문서도 SDK 타입도 바이너리 문자열도 실제 payload 형태를 다 담지 못한다. 플랫폼 사실 분쟁은 설치된 바이너리 grep 또는 실측 캡처 fixture로만 판정할 것.**
**How to apply:** 플러그인/hook 설계·구현 시 이 목록 기준. release 전 위 검증 방법으로 해당 버전 재확인. [[prd-cross-review-workflow]] 참조.
