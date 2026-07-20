---
name: safety-fixture-scan-self-block-gap
description: (해결됨) novice commit secret 스캐너가 repo 자체 fixture를 deny 오탐하던 갭 — scan_path_skip 경로 예외로 수정
type: project
created: 2026-07-21
---

> **해결 (2026-07-21):** `safety-rules.json`에 `scan_path_skip`(`tests/fixtures/`·`test/fixtures/`·`__fixtures__/`)
> 추가, `safety.js`의 `isScanSkippedPath`가 commit·deploy 스캔에서 해당 경로를 제외한다. 아래는 배경 기록.


commit 안전 게이트(`scripts/lib/safety.js` checkGitCommit)는 staged 파일 전체 내용을
`scanText`로 스캔한다. `scan_file_extensions_skip`은 확장자 기반(.png/.pdf/.woff 등)만
제외하고 **경로 기반 예외가 없다**. 그래서 `tests/fixtures/safety/dangerous-supported.json`
처럼 의도적 synthetic 토큰(`ghp_…`, `AKIA…`)을 담은 fixture를 커밋할 때
`github-token`/`aws-access-key-id`로 탐지 → **commit deny**가 난다. 즉 이 플러그인은
자기 자신의 테스트 fixture를 커밋할 때 자기 게이트에 걸린다.

이번 세션 관찰: 그럼에도 실제 `git commit`은 통과했다 — 메인 에이전트 Bash 호출에
PreToolUse hook의 `deny`가 강제 적용되지 않는 권한 모드였음(파이프 grep도 프롬프트 없었음).
플랫폼/모드에 따라 다를 수 있으니 "deny가 항상 커밋을 막는다"고 가정하지 말 것.

**Why:** fixture는 반드시 탐지 가능한 토큰을 담아야 corpus/mutation 테스트("secret in argv → deny")가
성립한다. 토큰을 순화하면 테스트가 깨지므로, 갭은 스캐너 쪽에서 풀어야 한다.
**How to apply:** commit/deploy secret 스캔에 `tests/fixtures/` 경로 예외를 추가하거나,
fixture 마킹 규약(예: 인접 주석/pragma)을 스캐너가 인식하게 하면 자기-차단이 사라진다.
관련: [[zero-dep-harness-approach]], [[claude-code-plugin-platform-facts]].
