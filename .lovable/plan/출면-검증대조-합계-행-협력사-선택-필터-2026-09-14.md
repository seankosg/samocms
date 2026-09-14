# 출면 검증대조 — 합계 행 + 협력사 선택 필터

## 1. 표 상단 Total 행

표 머리글 바로 아래에 현재 화면에 보이는 행들의 합계를 보여주는 **Total** 행을 고정 추가합니다.

- Company 칸: `Total` + 표시 건수(예: `Total · 24건`)
- Subcon Report / HDEC HSE Count / HDEC Exe Count: 값이 있는 항목만 더한 합계
- Diff (HSE) / Diff (EXE): 합계 차이(= HSE 합계 − 협력사 합계, EXE도 동일)를 기존과 같은 색 규칙(음수 빨강 / 양수 초록)으로 표시
- Result·Reporter·Counter 칸은 비움
- 배경 음영 + 굵은 글씨로 구분, 필터·검색을 바꾸면 합계도 함께 바뀜

## 2. 협력사 선택 풀다운 필터

상단 필터 줄(전체/DIFF 칩과 검색창 옆)에 **협력사 선택** 드롭다운을 추가합니다.

- 해당 날짜에 존재하는 협력사 목록을 가나다순으로 보여주고, 각 항목에 건수 표시
- 여러 곳 동시 선택 가능(체크 방식), 선택 시 칩에 선택 개수 표시, 「전체 해제」 버튼 제공
- 기존 표 머리글의 Company 필터와 같은 상태를 공유하므로 어느 쪽에서 골라도 동일하게 반영됨

## 기술 메모

- 대상 파일: `src/routes/_authenticated/manpower.compare.tsx` (한 파일만 수정)
- 합계는 `shown` 배열에서 `useMemo`로 계산, `<tbody>` 첫 행으로 렌더
- 협력사 드롭다운은 기존 `MultiSelectFilter`(`facet("company")` / `columnFilters.company`)를 툴바에 재사용해 상태 중복 없이 연결
- XLSX 내보내기 내용은 현행 유지(합계 행은 화면 전용)
