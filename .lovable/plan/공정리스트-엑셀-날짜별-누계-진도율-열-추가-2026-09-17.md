# 공정리스트 엑셀 — 날짜별 누계 진도율 열 추가

## 무엇을 만드나

공정리스트의 「XLSX」 내려받기 창에 **「누계 공정율 내려받기」** 옵션을 추가합니다.

- 체크하면 달력에서 **시작일 ~ 종료일**을 고릅니다(기간 길이 제한 없음).
- 내려받은 파일에는 기존 열 뒤에, 기간 내 **날짜마다 2열씩** 추가됩니다.
  예) `09.11 계획(%)` · `09.11 실적(%)` · `09.12 계획(%)` · `09.12 실적(%)` …
- 체크하지 않으면 지금과 완전히 동일한 파일이 나옵니다.

## 값 규칙

- **계획(%)**: 각 항목의 시작일~종료일 사이 일정 기준 자동 계산값(화면의 계획 진도율과 같은 방식).
- **실적(%)**: 그 날짜까지 기록된 마지막 누계 실적. 그날 기록이 없으면 **직전 기록값을 유지**하고, 그 이전에도 기록이 전혀 없으면 빈칸.
- 내보내는 행은 지금처럼 **화면에 적용된 필터·검색 결과**만.
- 시트 상단 부제에 「누계 공정율 2026.09.11 ~ 2026.09.16」을 함께 표기.
- 기간이 길면 열이 많아지므로, 선택 즉시 「날짜 N일 · 열 N×2개 추가」 안내 문구를 창에 표시.

## 동작 범위

기존 표 화면, 기준일 시점 값 토글, 대시보드·리포트 등 다른 화면은 **전혀 바뀌지 않습니다**. 추가 열은 내려받기 파일에만 들어갑니다.

## 기술 메모

- 새 서버 함수 `getSnapshotSeries({ from, to })` (`project.functions.ts`): `activity_snapshots`에서 `snapshot_date <= to`인 `item_key, snapshot_date, actual_progress`를 페이지네이션(.range 1,000행 단위)으로 모두 수집 → `item_key`별 `[date, actual]` 오름차순 배열 반환. 같은 날 중복 기록은 `captured_at` 최신 1건만.
- 훅 `useSnapshotSeries(from, to, enabled)` (`use-project.ts`), staleTime 120초. 내보내기 옵션 체크 시에만 fetch.
- `schedule-table.tsx`: `seriesOn`, `seriesFrom`, `seriesTo` 상태 추가. `exportRows`에서 옵션 ON이고 데이터 준비 완료면 각 행 rec에 날짜별 키를 push —
  - 계획: `planAt(r, d)` (이미 존재, 클라이언트 계산) × 100
  - 실적: 시리즈 배열에서 `date <= d`인 마지막 값 × 100 (carry-forward, 없으면 null)
  - 키 매칭은 기준일 시점 값과 동일한 `asOfKey` + `normMS`/`flat` 정규화 맵 재사용 → 공용 헬퍼로 추출.
- `export-dialog.tsx`: 선택적 prop `optionsSlot?: React.ReactNode`를 Output 라디오 아래에 렌더. 달력 UI는 `ScheduleTable`이 소유(shadcn `Popover` + `Calendar`, 기존 `DateRangeFilter` 스타일 참고). ExportDialog의 다른 사용처는 영향 없음.
- `getRows`가 최신 상태를 읽도록 `exportRows` 의존성에 시리즈 상태 포함.
- 마이그레이션 불필요(기존 `activity_snapshots`만 읽음).
