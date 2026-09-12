# 공정·지연 리스트 — 협력사 컬럼 위치 이동

## 목표
공정리스트와 지연리스트 표에서 **협력사(Subcon) 컬럼을 담당자 컬럼 바로 오른쪽**에 배치한다. 두 화면은 같은 표(`ScheduleTable`)를 공유하므로 한 곳 수정으로 동시 반영된다.

현재 순서: No. → 담당부서 → 담당자 → Bldg. → Room → Work Scope → Milestone → **Subcon** → Activity …
변경 순서: No. → 담당부서 → 담당자 → **Subcon** → Bldg. → Room → Work Scope → Milestone → Activity …

## 작업 내용

`src/components/schedule-table.tsx` 한 파일만 수정:

1. **컬럼 헤더 정의(`COLS`)**: `Subcon` 항목을 `담당자` 다음으로 이동
   - 기존 컬럼 필터(다중 선택) 기능 그대로 유지
2. **본문 행 렌더링**: `r.sub` 셀을 담당자 셀 바로 뒤로 이동
   - 편집 모드에서의 인라인 수정(subcontractor 필드) 기능 그대로 유지
3. **XLSX보내기(`exportRows`)**: `Subcon` 열을 `담당자` 오른쪽으로 이동해 화면과 동일한 순서로 출력

## 영향 범위
- `/schedule` (공정 리스트), `/delays` (지연 리스트) 두 화면에 자동 적용
- 필터·정렬·드릴다운·보내기 동작 변화 없음 (순서만 변경)

## 검증
- 타입 검사(`tsgo`) 통과
- 미리보기에서 두 화면의 컬럼 순서 확인
