# Progress 페이지 전면 개편 — 전체 공정 통합 S-curve

## 목표

기존 `/progress` 페이지의 라인마킹 7개 항목 전용 S-curve를 **폐기**하고, 전체 공정 항목(838건)을 계층 필터로 다중 선택해 통합 S-curve로 보여주는 화면으로 교체합니다.

## 화면 구성 (기존 /progress 페이지 재구성)

### 1. 필터 영역 (상단)

- **계층 필터**: 공종(Arch/Elec/Int/Mech/MS/Gas) → 건물 → 활동명 순으로 좁혀가는 다중 선택 필터. 기존 `column-filter.tsx`의 `MultiSelectFilter` 패턴 재사용.
- **항목 다중 선택**: 필터 결과로 좁혀진 항목 목록에서 체크박스로 개별 항목 선택/해제. 검색 입력 포함.
- **집계 방식 토글**: 수량 가중 평균 ↔ 단순 평균 전환 스위치.
  - 수량 가중: Σ(done_quantity) ÷ Σ(total_quantity) — 단위가 다른 항목 혼합 시 경고 문구 표시.
  - 단순 평균: 각 항목 진도율의 산술 평균.
- 필터·선택 상태는 URL search params(`validateSearch` + `zodValidator`, `fallback` 사용)로 관리해 공유·새로고침에 유지.

### 2. 통합 S-curve 차트 (메인)

- X축: 일별 날짜, Y축: 0~100%.
- **통합 누계 계획선**(점선): 선택 항목들의 계획 진도를 날짜별로 합산. 계획은 현재 활동 일정(`planAt` 로직 재사용) 기준 일별 배분.
- **통합 누계 실적선**(실선): `activity_snapshots`의 날짜별 실적을 합산. 같은 날짜에 여러 기록이 있으면 가장 마지막 기록 사용(기존 규칙 유지). 기준일 이후는 표시하지 않음.
- **항목별 개별선**(얇은 실선, 선택적 표시 토글): 선택된 항목 각각의 실적선을 옅은 색으로 함께 표시해 편차 확인. 항목이 많을 때(예: 20개 초과)는 기본 OFF.
- 범례·툴팁은 기존 Progress 차트 스타일(`ncr-progress-plan`/`ncr-progress-actual` 토큰) 유지.

### 3. 요약 KPI

- 선택 항목 수, 통합 계획 진도율, 통합 실적 진도율, 계획 대비 차이(±%p) 카드.

## 데이터 계층

- 신규 서버 함수 `getActivityHistory` (`src/lib/line-marking.functions.ts`를 `src/lib/progress.functions.ts`로 확장/이름 변경): `activity_snapshots`에서 선택된 item_key 목록의 날짜별 실적을 조회. 항목 수가 많으므로 item_key 배열을 인자로 받아 서버에서 필터링(1000행 페이지네이션 유지).
- 계획선은 기존 `useProject()`의 활동 일정 데이터(시작/종료일, 총수량)로 클라이언트에서 계산 — 별도 서버 호출 불필요.
- 기존 `getLineMarkingHistory`는 삭제.

## 삭제/정리 대상

- `/progress` 페이지 내 라인마킹 7개 항목 고정 필터(`dept === "Arch" && act === "라인마킹"`) 및 항목별 카드 그리드 전체.
- `src/lib/line-marking.functions.ts` (새 함수로 대체).
- 사이드바 메뉴 "Progress" 항목은 유지하되 설명 문구를 전체 공정 기준으로 변경.

## 기술 메모

- `src/routes/_authenticated/progress.tsx` 전면 재작성: `validateSearch`로 `disciplines`, `buildings`, `activities`, `items`(item_key 배열), `agg`("weighted"|"simple"), `showItems`(boolean) 관리.
- 통합 시리즈 빌더는 순수 함수로 분리(`src/lib/progress-scurve.ts`): 날짜 범위 생성, 계획 일별 배분, 스냅샷 실적 매핑, 두 집계 방식 합산. 기존 `buildSeries`/`planAt` 로직 재사용.
- item_key는 기존 `itemKeyOf(dept, no, act)` 규칙 그대로 사용.
- 성능: 전체 838건 선택 시에도 스냅샷 조회는 item_key IN 필터 + 페이지네이션으로 처리, 차트 포인트는 날짜 수(최대 ~1500) × 시리즈 수로 제한.

## 진행 순서

1. `progress.functions.ts` 서버 함수 + `progress-scurve.ts` 순수 로직
2. `/progress` 페이지 필터·차트·KPI UI 재작성
3. 기존 라인마킹 전용 코드 삭제
4. 타입 검사(`bun x tsgo --noEmit`) 및 미리보기 확인
