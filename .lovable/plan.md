# T&C Progress에 Baseline / Remaining 계획 기준 토글 추가

T&C Progress 화면(S-Curve · 요약 수치 · 매트릭스)에 계획을 보는 두 가지 기준을 추가합니다. SHAW 프로젝트 검토에서 확인된 문제점(화면마다 완료 판정이 다름, 계획만 줄어 실적이 과대해 보임)을 피하도록 설계합니다.

## 두 모드의 정의

- **Baseline** (기본값) — 지금 화면과 완전히 동일. 원래 계획일 그대로 집계.
- **Remaining** — 기준일까지 이미 끝난 단계의 계획은 **없애지 않고 실제 완료일 위치로 옮겨서** 집계. 아직 안 끝난 단계는 원래 계획일 그대로.

이 방식의 장점:
- 계획 누계선이 언제나 100%에 수렴합니다.
- 계획과 실적의 모수가 같아, 실적이 계획을 크게 초과하는 착시가 사라집니다.
- 남은 일감은 "계획선에서 기준일 이후 남은 구간"으로 그대로 읽힙니다.
- 지연 판정(계획 도래 · 미완료)은 두 모드에서 값이 같습니다 — 완료된 항목만 이동하기 때문입니다.

## 완료 판정 기준 통일

S-Curve, 요약 수치, 매트릭스가 모두 **같은 한 가지 규칙**을 씁니다.

> 해당 단계의 실적일이 존재하고 **기준일 이하**이면 "기준일 시점 완료".

진도율 100%지만 실적일이 없는 항목처럼 화면마다 다르게 잡힐 여지를 없앱니다.

## 화면 변경

- 상단 툴바에 **계획 기준** 전환 버튼 추가: `Baseline` / `Remaining` (기본 Baseline).
- 선택값은 주소에 남아 링크 공유·새로고침 시 유지됩니다.
- S-Curve 카드 제목 옆과 매트릭스 머리글에 현재 기준을 한 줄로 표시 — 예: `계획 기준: Remaining (완료분은 실적일로 이월)`.
- 적용 범위는 T&C Progress 화면만. 대시보드와 예측 화면은 지금 그대로 둡니다.

## 기술 상세

- `src/lib/tc-plan-mode.ts` 신설
  - `export type TcPlanMode = "baseline" | "remaining"`
  - `isStageDoneAsOf(item, stage, base)` — `ACT_COL[stage]`가 있고 `<= base`
  - `effectivePlanDate(item, stage, mode, base)` — remaining이고 기준일 시점 완료면 실적일, 아니면 `PLAN_COL[stage]`
  - `tcItemKey(item)` — `discipline|bldg|grp|equip|row_no` (실데이터로 `tc_daily_progress.item_key`와 일치 확인 완료)
- `src/lib/tc-progress-utils.ts` — `assembleMatrix(opts)`에 `planMode` 추가
  - `items` 루프: `cumPlan`을 `effectivePlanDate` 기준으로 집계
  - `daily` 루프: remaining일 때 `(item_key, stage)`가 기준일 시점 완료이면 `plan_count/plan_qty`를 `event_date` 버킷이 아니라 **실적일 버킷**에 더함. 실적일이 조회 구간 밖이면 버림. `actual_*`는 두 모드 동일
- `src/lib/tc-scurve-utils.ts` — `buildTcSCurve(opts)`에 `planMode` 추가, `cumPlan` 합산 시 `PLAN_COL` 대신 `effectivePlanDate` 사용. `dailyPlan` 막대는 매트릭스 셀에서 오므로 자동 반영
- `src/routes/_authenticated/tc.progress.tsx`
  - `planMode` 상태 + `Search.plan` 검증/동기화 (기본 `baseline`이면 URL에서 생략)
  - `Seg` 컴포넌트로 토글 렌더, `assembleMatrix`/`buildTcSCurve`/`cumulativeTotals`에 전달
  - `cumulativeTotals`도 같은 완료 판정 규칙 사용
- `src/components/tc-progress/tc-plan-vs-actual-card.tsx`, `tc-schedule-matrix.tsx` — 기준 표시 문구용 `planMode` prop 추가 (계산 로직 변경 없음)
- 드릴다운 링크는 변경 없음 — 두 모드 모두 실제 항목 목록은 동일해야 하므로 원계획/실적 필드를 그대로 사용

## 검증

- `bun x tsgo --noEmit`
- Baseline에서 현재 화면 수치(총합계 · 계획 누계 · 실적 누계 · 차이)가 **한 자리도 바뀌지 않는지** 확인
- Remaining에서 계획 누계 ≥ 실적 누계이고 마지막 버킷 계획 누계가 100%인지 확인
- 같은 조건에서 S-Curve 요약 수치와 매트릭스 누계 P/A 합계가 서로 일치하는지 확인
