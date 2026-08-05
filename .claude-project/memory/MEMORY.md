# Memory Index

- [claude-code-plugin-platform-facts](claude-code-plugin-platform-facts.md) — 바이너리 grep·live 캡처로 확정한 플러그인·hook 사실 + 설치 채널(문서 조사, 미실측) (문서/SDK snapshot은 낡음 주의)
- [hook-payload-capture-method](hook-payload-capture-method.md) — hook payload 실측 캡처법(stdin-dump + headless + --plugin-dir), headless로 못 잡는 이벤트 목록
- [prd-cross-review-workflow](prd-cross-review-workflow.md) — Novice PRD는 Codex+Claude 교차 검토로 발전, Claude는 문서 사실 검증 담당 (rev9, 구현 완료 123 tests)
- [bootstrap-credential-policy-per-provider](bootstrap-credential-policy-per-provider.md) — 부트스트랩 plaintext 로그인 정책은 provider별 manifest(고지형 vercel vs 중단형 gh/supabase)
- [omc-parallel-subagent-session-limit-recovery](omc-parallel-subagent-session-limit-recovery.md) — 병렬 subagent가 session limit에 걸리면 부분 산출물 회수 후 인라인 전환
- [zero-dep-harness-approach](zero-dep-harness-approach.md) — zero-dep 프로젝트 하네스: eslint/knip/husky 대신 verify-docs + node 내장 coverage/CI
- [safety-fixture-scan-self-block-gap](safety-fixture-scan-self-block-gap.md) — (해결) commit/deploy 스캔에 scan_path_skip 경로 예외 추가 (tests/fixtures/ 등)
- [novice-safety-minimalism](novice-safety-minimalism.md) — 사용자 확정: 안전 게이트는 deny-only 최소 코어, ask 티어 금지, 애매하면 CC 네이티브 위임
- [npm-publish-flow](npm-publish-flow.md) — 토큰은 `~/.npmrc`(`.env` 아님), 범위 넓어 새 패키지도 생성 가능. `npm login` 금지(E403). 샌드박스가 npmrc를 가려 ENEEDAUTH 오진을 부른다
- [novice-capsule-injection-invariants](novice-capsule-injection-invariants.md) — capsule revision은 identity 집합 해시, 상한 초과 시 산문부터 폐기(지시 목록 불가침), 다이얼별 네임스페이스·tombstone
- [novice-output-style-prohibition-guard](novice-output-style-prohibition-guard.md) — output style 미사용은 PRD 확정(설계안 C 기각). 가드가 `.md` 포함 전 트리에서 문자열 0건 강제 — 문서에 써도 깨진다

