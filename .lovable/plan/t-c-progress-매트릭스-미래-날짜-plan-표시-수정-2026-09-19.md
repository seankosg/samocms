# T&C Progress 매트릭스 — 미래 날짜 Plan 표시 수정

## 현상
T&C Progress 매트릭스에서 기준일 이후(미래) 날짜 셀이 「·」으로 비어 보입니다.
Plan(계획)은 미래 날짜에도 표시되어야 하고, Actual만 미래에서 숨기는 것이 원래 설계입니다.

## 원인 (확인 완료)
- DB `tc_daily_progress`에는 미래 날짜의 계획이 정상적으로 존재 (예: 9/19 계획 211건, 9/23 266건).
- 그러나 `getTcDailyProgress` 서버 함수가 `order(event_date asc)`로 조회하면서 페이지네이션이 없어, DB API가 한 번에 **최대 1,000행**까지만 반환 → 기간 앞쪽(과거) 행에 밀려 **뒤쪽 미래 날짜 데이터가 잘림**.
- 그 결과 매트릭스 셀에 plan=0으로 집계되어 `empty` 처리(「·」)됨.

## 수정 내용

### 1. `src/lib/tc-progress.functions.ts` — `getTcDailyProgress` 페이지네이션 추가
- 기존 `getSnapshotSeries`와 동일한 방식으로 `.range(from, from + PAGE - 1)` 를 1,000행 단위로 반복 조회해 전 구간 데이터를 모두 수집.
- 반환 형태·정렬은 기존과 동일(event_date 오름차순) → 화면 코드 변경 불필요.

### 2. 셀 렌더링 확인 (변경 없음)
- `TcScheduleCell`은 이미 미래 날짜에도 Plan 숫자·미니바를 표시하고 Actual만 「—」로 숨기도록 되어 있어, 데이터가 모두 내려오면 그대로 정상 표시됨.

## 검증
- `bun x tsgo --noEmit` 통과.
- Playwright로 `/tc/progress` 접속 → 기준일(9/18) 이후 날짜 셀에 Plan 값과 파란 미니바가 표시되고 Actual은 「—」인지 스크린샷 확인.
- S-Curve 카드의 미래 구간 Plan 선도 함께 확인.

## 영향 범위
- 조회 함수 내부 구현만 변경. 매트릭스·차트·드릴다운 로직, DB 스키마/데이터는 그대로.
- 과거~기준일 구간의 표시 값은 동일하게 유지됨(추가되는 것은 잘려 있던 미래 날짜 행뿐).
