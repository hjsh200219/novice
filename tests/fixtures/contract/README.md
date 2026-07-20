# Claude Code 2.1.215 hook payload contract fixtures

이 디렉토리의 fixture는 최소 지원 runtime(Claude Code **2.1.215**)에서 **실측 캡처**한
hook payload다. 캡처 방법: capture 전용 프로젝트에 stdin 덤프 hook을 등록하고
`claude -p`(headless) 세션 3회 + `--plugin-dir`로 novice 플러그인을 로드해
`/novice:mode 2` slash command까지 실행했다 (2026-07-20, macOS).

## provenance 필드 범례

| 값 | 의미 |
|---|---|
| `captured-2.1.215` | 실측 payload 그대로 (경로만 sanitize: cwd·transcript_path를 고정값으로 치환) |
| `derived-from-capture-2.1.215` | 실측 shape에서 필드 값만 바꾼 변형 (예: source=clear, args=9, 카운터용 메시지) |
| `documented` | 실측 불가 — 공식 문서 shape 기준 |

## 실측으로 확인된 계약 (문서 대비 차이 포함)

- 공통 필드에 `prompt_id` 존재 (SessionStart/SessionEnd 제외 대부분).
- `PostToolBatch`는 `tool_calls: [{tool_name, tool_input, tool_use_id, tool_response}]`.
- `PostToolUse.tool_response`(Bash)는 `{stdout, stderr, interrupted, isImage, noOutputExpected}` + `duration_ms`.
- `PostToolUseFailure`는 `error`(예: "Exit code 1"), `is_interrupt`, `duration_ms`.
- `Stop`은 `last_assistant_message`, `stop_hook_active` + `background_tasks`, `session_crons`.
- `UserPromptExpansion.command_source`는 `"plugin"` (plugin 이름이 아니라 종류).
- plugin `userConfig` 항목에는 `title`이 필수다 (`claude plugins validate`).
- `--plugin-dir` 로드 시 `CLAUDE_PLUGIN_DATA`는 `~/.claude/plugins/data/<plugin>/`로 제공됨 (E2E 확인).

## 남은 documented 항목

| fixture | 사유 |
|---|---|
| session-start-clear / -compact | headless `claude -p`에서 `/clear`·auto-compact 트리거 불가. shape는 실측 startup과 동일 전제(derived), source 값만 문서 기준 |
| pre-tool-use-mcp-destructive | capture 환경에 MCP server 미연결. tool_name/tool_input 구조는 문서 기준 |

릴리스 전 interactive 세션에서 `/clear`·compact·MCP 캡처로 교체 권장.
