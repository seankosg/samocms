# 검증 대조 — HDEC 재집계를 HSE / EXE로 분리

지금은 같은 카드(협력사·날짜·장소·조)에 여러 명이 재집계를 올려도 **가장 마지막 한 건만** 남고 나머지는 「재제출」로 밀려납니다. 실제 기록을 보면 9/14 하루에도 한 카드에 확인자가 2~3명 들어오는 경우가 많아, 안전(HSE)팀 집계와 공무·수행팀(EXE) 집계가 서로를 덮어쓰고 있습니다.

이번 작업은 재집계를 **HSE 그룹 / EXE 그룹 두 줄로 나란히** 보여 주고, 각 그룹 안에서만 최신 값이 앞선 값을 덮어쓰도록 바꿉니다.

## 분류 기준 (확정)

- **HSE**: 확인자의 부서가 `안전 (HSE)` 또는 `안전관리팀`
- **EXE**: 그 외 모든 부서(사업수행팀·건축·사업지원2팀 등) **및 부서 미지정**
  - 부서 미지정 확인자(황태연 38건, Sean KO 1건)는 EXE로 집계되며, 명부에 부서를 채우면 다음 조회부터 자동으로 HSE/EXE가 바뀝니다.

## 표 구성 (하단 집계표)

| 기존 | 변경 |
|---|---|
| HDEC Recount | **HDEC HSE Count** / **HDEC Exe Count** |
| Difference | **Diff (HSE)** / **Diff (EXE)** |
| Result | **Result (HSE)** / **Result (EXE)** — 두 판정을 따로 표시 |
| HDEC Counter | **HSE Counter** / **EXE Counter** |

- 각 Count/Counter 칸은 그 그룹의 **가장 마지막 제출값**입니다.
- 같은 그룹 안에서 앞선 제출이 있으면 지금처럼 「재제출 N회」 뱃지가 붙고, 눌렀을 때 **그 그룹의 이력만** 시각·입력자·직종별 인원·증감과 함께 보여 줍니다.
- 그룹에 집계가 없으면 `—`, 판정도 빈칸으로 둡니다.
- 열 필터·정렬·검색·XLSX 내보내기 모두 새 열 기준으로 동작합니다.

## 상단 요약·차트

- **검증 커버리지**: HSE·EXE 중 하나라도 재집계가 있으면 검증된 것으로 봅니다.
- **일치율 / 평균 절대차 / 미보고 발견**: HSE 값이 있으면 HSE 기준, 없으면 EXE 기준으로 계산합니다(대표 판정).
- 상단의 전체/차이/HDEC 단독/미집계/일치 필터 칩도 이 대표 판정을 씁니다.
- 차이 추이 차트는 대표 판정 기준으로 지금과 동일하게 유지합니다.

## 기술 메모

- 새 뷰 `v_manpower_hdec_groups`: `manpower_entries`(source=HDEC, 상태 무관)를 회사·장소 별칭으로 정규화한 뒤 `manpower_members.dept`로 `grp`(HSE/EXE)를 붙이고, `(company, report_date, location, shift, grp)` 단위로 `submitted_at DESC`의 첫 행을 현재값으로, 나머지 건수를 `superseded_count`로 냅니다. 봇이 찍는 ACTIVE/SUPERSEDED는 그룹을 구분하지 못하므로 이 뷰에서는 쓰지 않습니다.
- `v_manpower_compare` 재정의: SUB 카드에 위 뷰를 HSE·EXE로 두 번 LEFT JOIN 해 `hse_verified/exe_verified`, `hse_diff/exe_diff`, `hse_result/exe_result`, `hse_counter(_tg_id)/exe_counter(_tg_id)`, `hse_superseded/exe_superseded` 추가. 기존 `verified/diff/result/hdec_counter*`는 대표값(HSE 우선, 없으면 EXE)으로 유지해 다른 화면·차트가 깨지지 않게 합니다. HDEC만 있는 카드도 FULL JOIN으로 계속 나옵니다.
- `manpower-model.ts`: `CompareRow`에 새 필드 추가, `verificationStats`는 대표값 사용(그대로), HSE/EXE 판정용 헬퍼 추가.
- `getCardHistory`에 선택 파라미터 `group: "HSE" | "EXE"` 추가 — HDEC일 때 해당 그룹 확인자의 기록만 반환(명부 dept 기준 필터). `card-history.tsx`는 `group`을 쿼리 키와 인자에 반영.
- `manpower.compare.tsx`: 열 정의·필터 키·XLSX 열(`HDEC HSE Count`, `Diff (HSE)`, `Result (HSE)`, `HDEC Exe Count`, `Diff (EXE)`, `Result (EXE)`, `HSE Counter`, `EXE Counter`) 갱신, `ReporterCell`에 `group` prop 추가.
