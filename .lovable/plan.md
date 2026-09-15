# 발주처 업역(HMMME) 공정 분리 · Rev. 6

## 검토 요약

지시서 내용은 대부분 그대로 구현 가능합니다. 다만 실제 데이터와 다른 점이 두 가지 있어 아래 기준으로 진행합니다.

- 인허가에 섞여 있는 발주처 행은 현재 **26건**입니다(지시서의 34건은 파일 기준). 이 26건은 이번에 한 번에 발주처 업역으로 옮깁니다.
- 지시서의 부서별·건물별 건수(Paint 47 등)는 파일 기준 참고값이므로 화면에 고정하지 않고 실제 데이터로 계산합니다. 따라서 인수 확인 3번(건수 무변동)은 26건만큼 줄어드는 것이 정상입니다.

## 1. 업역 판정 일원화

- Work Scope 가 `발주처` 또는 `HMMME` 이면 발주처 업역으로 보는 판정 함수 하나를 만들고, 담당자 이름으로 판정하던 곳(예측 차트, Progress Report)을 모두 이 함수로 교체합니다.
- 담당자만 `HM`/`발주처`인데 Work Scope 가 다른 행은 현재 0건이라 전환에 따른 부작용이 없습니다.

## 2. 데이터·업로드

- `activities` 에 발주처 내부 부서를 담는 칸(`owner_dept`)을 추가합니다.
- 파일명에 `발주처`/`HMMME` 가 있으면 공종을 `HMMME` 로 고정하고 발주처 행만 가져옵니다. 담당부서 값은 `owner_dept` 에 담습니다.
- 공종 파일(Arch·Elec·Mech·Int·Permit)은 발주처 행을 건너뜁니다. 또한 이미 발주처 업역으로 등록된 번호와 겹치는 행도 버리고, 업로드 확인창에 "발주처 업역으로 등록된 항목 n건 제외"를 표시합니다.
- 파일명에 공종 표시가 없으면 업로드 확인창에서 공종을 직접 고르게 하고, 파일명 전체를 공종으로 삼던 방식은 없앱니다.
- 기존 인허가 안의 발주처 26건은 1회 정리로 발주처 업역(`HMMME`)으로 이관합니다.
- 발주처 공종의 편집 권한은 인허가 권한과 공유하도록 권한 규칙을 확장합니다.

## 3. 기존 화면 조정

- 발주처 행을 빼는 곳: 대시보드 KPI·예측, Progress Report, 지연 리스트, 공정 리스트.
- 그대로 두는 곳: 오늘의 주요 작업, 안전 리포트, 네트워크 공정표(밴드 라벨만 `HMMME` 로).
- 팀별 집계에는 발주처 부서가 아니라 「HMMME」 한 줄로만 잡히게 합니다(안전 리포트 국문·영문 모두).

## 4. 새 섹션 「발주처 업역」

### 발주처 공정현황
- 부서별·건물별 KPI, 마일스톤 행, 진도·리스크 분석, 예측 차트, 하단 지연 리스트.
- 대시보드의 기존 분석·예측 구성요소를 재사용하되 대상 행만 발주처로 바꿉니다.

### 발주처 공정 리스트
- 공정 리스트와 동일한 검색·필터·정렬·Excel 내보내기, 공종 필터 자리는 부서 필터.

### 기준일
- 전사 기준일과 별개의 자체 기준일. 기본값은 업로드된 발주처 파일 기준일, 화면에서 변경 가능, 주소에 저장되어 새로고침·공유에도 유지, 변경 시 계획 진도·지연·예측 전부 재계산.

## 5. 부수 정리

- 건물명 오타 `Main offiice` 를 건물 별칭표에 추가.
- 마일스톤 번호(`M1`/`M.1`)를 저장 전에 통일.
- 화면 라벨에 `HMMME` 추가, 발주처 부서 약어(Paint·IT·Secu·Ass'y·Glov·Body)는 영문 그대로 표시.
- 화면과 Excel 내보내기 모두 `발주처`·`HM` 원문 대신 `HMMME` 로 표시합니다. DB 에는 원문을 그대로 남깁니다.

## 기술 메모

- `schedule-model.ts`: `isOwnerScope(row)` 신설, `isClientOwned` 사용처(`report-metrics.ts`, `forecast-chart.tsx`) 교체. `bandOf` 도 동일 함수 사용. `SLOT_LABEL`/`SLOT_LABEL_EN` 에 `HMMME` 추가, `BLDG_STD` 에 `mainoffiice` 별칭 추가.
- `forecast-chart.tsx` 의 대상 행 필터를 prop 으로 주입 가능하게 개방(기본값은 현행 동작 유지).
- `import-schedule.ts`: `sourceKeyFromFileName` 에 발주처 토큰 인식 + 폴백 제거(공종 미확정 시 null 반환), `ImportRow` 에 `owner_dept`. `upload.tsx` 에 공종 선택 UI, 제외 건수 표시.
- `project.functions.ts`/`activities.functions.ts`: upsert 키는 기존 `(source_file, activity_no)` 유지, 발주처 중복 제거는 import 시 기존 `HMMME` 번호 조회로 처리.
- 마이그레이션: `activities.owner_dept text` 추가 + `activity_snapshots` 동일 컬럼, `slot_scope()` 에 `hmmme -> permit` 매핑 추가. 기존 26행 이관은 데이터 변경으로 별도 실행.
- 새 라우트: `src/routes/_authenticated/owner.index.tsx`, `owner.list.tsx`, 사이드바 「발주처 업역」 섹션. 기준일은 검색 파라미터 `ownerBase` + `applyBaseline`.
