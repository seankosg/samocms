# T&C Progress 페이지 신설 (QAIL Snag Progress 이식)

QAIL PROJECT CMS의 Snag Management > Progress 화면(Plan vs Actual S-Curve + Progress Matrix)을 구조·레이아웃·상호작용 그대로 가져와, 데이터만 우리 T&C 계획/실적으로 바꿔 넣습니다.

## 확정된 기준

- 집계 단위: **건수(Count) / 수량(Qty) 토글** — 툴바에서 전환, 차트·매트릭스·KPI 모두 동시 적용
- 행 그룹(Group By, 다중 선택): **건물 / Item / Group / 공급사 / 공종**
- 기준일: **앱 기준일(baseline_date)** — Today 선, "Up to" 누계 컬럼, 미래 실적 숨김 모두 이 날짜 기준
- 셀·KPI 클릭 시 **T&C List 드릴다운**

## 화면 구성 (원본과 동일한 순서)

```text
[툴바 카드]  공종 · 건물 · 단계(Stage) · 그룹 · Bucket(Day/Week/Month) · Range · Hide past · 건수/수량
[KPI 스트립] TOTAL · PLAN · ACTUAL · DIFF · 달성률   (각 카드에 단계별 내역, 클릭 드릴다운)
[Plan vs Actual — S-Curve]  접기/펼치기 카드
   · 좌축: 기간별 Plan/Actual 막대(단계별 스택)
   · 우축: 단계별 누적 Plan(점선)/Actual(실선) 진도율 %
   · 기준일 세로 점선 + "기준일" 라벨, 미래 구간 실적 끊김
   · 상단 단계별 P / A / Δ 요약 배지, 클릭형 범례(계열·지표 개별 on/off, 초기화)
   · 하단 Variance 막대(Δ Actual − Plan, 양수 녹색 / 음수 적색)
[Progress Matrix]  접기/펼치기 카드
   · 좌측 고정 블록: 그룹명 | Total Scope(Total/Done/%/Remain) | Up to 기준일(Plan/Actual/%/Diff)
   · 우측 타임라인: 버킷별 셀 = Plan 미니바 + Actual 미니바 + Δ
   · 헤더/본문 가로 스크롤 동기화, 기준일 컬럼 자동 스크롤·강조, 컬럼 가상화
```

## 데이터 매핑

원본은 Snag 6단계(Start/Rect/Pr-Ins/Dr-Ins/Close/H-O)입니다. 우리는 T&C 6단계로 1:1 대응합니다.

| 원본 | T&C |
|---|---|
| Stage 6종 | T0 · T1 · Report · RFI · T2 · Response |
| plan/actual 일별 셀 | `tc_daily_progress` (event_date, stage, plan_count/actual_count, plan_qty/actual_qty) |
| Total Scope | `tc_items` 의 항목 수 / qty 합 |
| Group By 축 | `bldg`, `item`, `grp`, `supplier`, `discipline` |
| today | 앱 기준일 |

`tc_daily_progress`에는 이미 단계별·일자별 계획/실적이 건수와 수량 양쪽으로 기록되어 있어 신규 테이블은 필요 없습니다.

## 만들 파일

- `src/lib/tc-progress-utils.ts` — 원본 `progress-utils.ts` 이식. 버킷 생성(day/week/month), 버킷 라벨, `assembleMatrix`, 그룹키→검색 파라미터 변환. Snag 스테이지 상수만 T&C 스테이지로 교체.
- `src/lib/tc-scurve-utils.ts` — 원본 `scurve-utils.ts` 이식. 단계별 일일/누적 시리즈 빌더, 미래 구간 null 처리, 단계별 색상표.
- `src/lib/tc-progress.functions.ts` — 인증 서버 함수 2개.
  - `getTcProgressCells`: `tc_daily_progress`를 그룹키 × 버킷 × 단계로 집계
  - `getTcProgressTotals`: `tc_items` 기준 그룹별 총량·완료·기준일까지 누계 Plan/Actual
- `src/components/tc-progress/tc-schedule-cell.tsx` — 원본 `ScheduleCell` 이식(Plan/Actual 미니바 + Δ, memo).
- `src/components/tc-progress/tc-schedule-matrix.tsx` — 원본 `SnagScheduleMatrix` 이식(고정 좌측 블록, 스크롤 동기화, 기준일 자동 스크롤, 가상화).
- `src/components/tc-progress/tc-plan-vs-actual-card.tsx` — 원본 `SnagPlanVsActualCard` 이식(ComposedChart + Variance 차트 + KPI 배지).
- `src/components/tc-progress/progress-chart-legend.tsx` + `use-progress-legend.ts` — 원본 범례 컴포넌트/훅 이식.
- `src/routes/_authenticated/tc.progress.tsx` — `/tc/progress` 라우트. 툴바·KPI·두 카드 조립, 검색 파라미터 상태 관리, 드릴다운 이동.

## 수정할 파일

- `src/components/app-shell.tsx` — 사이드바 "시운전 (T&C)" 그룹에 **T&C Progress** 항목 추가(T&C List 위).
- `src/lib/list-search.ts` — 드릴다운용 파라미터 보강(`grp`, `supplier`, `from`, `to`, `field`= plan/actual).
- `src/routes/_authenticated/tc.list.tsx` — 추가된 파라미터로 초기 필터 적용.
- `src/styles.css` — 원본과 동일한 매트릭스 셀 색 토큰 추가(`--schedule-plan/actual/over/short`, 라이트·다크 동일 값).

## 기술 사항

- 상태는 전부 URL 검색 파라미터(공종·건물·단계·그룹·버킷·범위·hidePast·단위·카드 펼침)로 관리 → 새로고침·공유 유지. 원본과 동일한 방식.
- 차트는 이미 설치된 `recharts` + 기존 `components/ui/chart.tsx` 사용.
- 매트릭스 컬럼 가상화를 위해 `@tanstack/react-virtual` 1개 추가 설치.
- 데이터 조회는 `createServerFn` + `requireSupabaseAuth`, 집계는 SQL 측에서 수행해 전송량 최소화.
- 권한: 조회 전용 화면이므로 Admin/User/Guest 모두 접근 가능.
- 라우트 `head()`에 고유 title/description/og 메타 지정.
