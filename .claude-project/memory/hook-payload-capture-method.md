---
name: hook-payload-capture-method
description: Claude Code hook payload 실측 캡처 방법 — stdin-dump 캡처 프로젝트 + headless(claude -p) + --plugin-dir 로드
type: reference
created: 2026-07-20
---

Claude Code hook의 **실제 payload 형태**를 확정하려면(문서·SDK 타입·바이너리 문자열로는 payload 키를 다 못 잡음) 실측 캡처를 쓴다. 전제: **로컬 설치 runtime 버전 == 검증 대상 pinned 버전**이어야 캡처가 권위를 가짐(예: 둘 다 2.1.215).

**방법**
1. 캡처 전용 프로젝트를 만들고, 각 hook 이벤트를 stdin 전체를 파일로 덤프하는 스크립트("stdin-dump" hook)에 연결한다.
2. `claude -p`(headless/print 모드)로 세션을 돌려 이벤트를 발생시키고 덤프된 JSON을 fixture로 회수한다.
3. 플러그인 hook을 캡처하려면 `--plugin-dir <plugin>`으로 플러그인을 로드한 headless 세션을 별도로 돌린다(3개 세션 조합: 기본 2 + plugin 로드 1이 novice에서 실제로 쓰인 구성).

**headless로 캡처 불가 → 문서 기반 fixture로만 유지**
- `SessionStart`의 `clear`/`compact` source (대화형에서만 발생).
- MCP 파괴적 tool payload (headless에서 트리거 불가).

**Why:** novice 플러그인 완료 기준에 "실측 계약 fixture"가 있었고, 이 방법으로 바이너리 grep이 못 잡던 델타(userConfig `title` 필수, PostToolBatch `tool_calls[]`, expansion `command_source="plugin"` 등)를 실제로 발견·수정했다. 상세 델타: [[claude-code-plugin-platform-facts]].
**How to apply:** 플랫폼 hook/plugin 계약을 실제로 확정해야 할 때 이 절차를 재사용한다. 캡처 불가 이벤트는 fixture README에 "documented-only"로 명시하고 실측분과 구분한다. release마다 로컬 runtime 버전이 pinned와 같은지 먼저 확인.
