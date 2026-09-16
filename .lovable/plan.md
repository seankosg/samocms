# 발주처 공정 리스트 — 표에 실제 담당부서 표시

## 목표
발주처 리스트 표의 `담당부서` 칸을 실제 부서(Paint·IT·HM·Secu·Ass'y·Glov·Body·MS)로 보여 주고, 상단 부서 탭이 표와 어긋나지 않게 맞춥니다. 저장된 공정 값(HMMME)과 다른 화면의 로직은 그대로 둡니다.

## 현재 문제
- 표의 `담당부서` 칸은 공종 값(`dept` = HMMME)을 보여 주어 모든 행이 HMMME로 보입니다.
- 상단 부서 탭을 누르면 그 값이 표 내부의 담당부서 필터로도 전달되는데, 표는 HMMME와 비교하므로 조건이 어긋나 결과가 비거나 이상하게 나옵니다.
- 표 헤더의 담당부서 필터 목록에도 HMMME 하나만 뜹니다.

## 변경 내용
1. 공정 표에 "발주처 부서 표시" 모드 옵션을 추가합니다. 이 모드에서만 담당부서 값으로 실제 부서(`ownerDept`)를 쓰고, 값이 없으면 기존처럼 공종 값을 씁니다.
2. 이 모드일 때 적용되는 곳: 표의 담당부서 칸, 담당부서 열 필터 목록·개수, 담당부서 정렬, 검색어 대상, 엑셀 내보내기의 담당부서 열.
3. 발주처 공정 리스트 화면에서만 이 모드를 켭니다. 당사 공정 리스트와 다른 화면은 지금과 완전히 동일하게 동작합니다.
4. 상단 부서 탭 → 표 필터 연결을 같은 기준(실제 부서명)으로 맞춰, 탭 선택 시 표와 열 필터가 일치하도록 합니다.

## 건드리지 않는 것
- 데이터베이스에 저장된 공정 구분(HMMME)과 `owner_dept` 값
- 발주처 권한 판정, 발주처 페이지 묶음 인식, 네트워크 보라색 표시
- 대시보드·예측·스냅샷 집계 로직

## 기술 메모
- `src/components/schedule-table.tsx`: `ScheduleTable`에 `deptMode?: "slot" | "owner"` prop 추가. `deptLabel(r)` 헬퍼를 만들어 `multiValue("dept")`, 행 렌더(257행 부근), `passes`의 검색 haystack, 정렬 키 `dept`, 엑셀 행(165행)에서 공통 사용. `initial.dept` 초기화도 owner 모드에서는 `SLOT_LABEL` 매핑을 건너뜁니다.
- `src/routes/_authenticated/owner.list.tsx`: `<ScheduleTable deptMode="owner" ... />` 전달. 상단 탭 목록·필터는 이미 `r.ownerDept ?? r.dept` 기준이므로 유지.
- 검증: `bun x tsgo --noEmit` + Playwright로 `/owner/list`에서 부서 탭 클릭 시 행 수와 담당부서 칸 값 확인.
