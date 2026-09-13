# 출면 입력자(작성자) 표시 + HDEC 재점검 이력

현재 출면 화면은 값을 낸 사람을 기록에 적힌 텔레그램 표시 이름 그대로만 보여 줍니다(예: `황태언 HDEC`, `건웅 장`, `Chathuranga HDEC`). 등록된 정식 이름·부서와 다르고, HDEC 재점검처럼 같은 카드를 여러 명이 입력해 마지막 값만 살아 있는 경우 누가 낸 값인지 알 수 없습니다.

## 1) 직원 명부에 직책·부서 추가 — 부서 표기 일관성

부서 표기는 **CMS 사용자관리의 담당공종 표기를 기준**으로 합니다. 첨부파일 표기를 기준표에 맞춰 변환해 저장합니다.

출면기록 관리자 명부에 「직책」과 「부서(담당 공종)」 칸을 추가하고, 첨부해 주신 명단의 현대건설 외국인 직원 22명을 반영합니다. 텔레그램 ID가 이미 등록된 분들과 모두 일치해 새로 만들지 않고 값만 채웁니다.

변환 규칙:

| 첨부파일 표기 | 저장할 부서 표기 |
|---|---|
| 건축(Arch/Int) | 건축 (Arch) |
| 설비(Mech) | 설비 (Mech) |
| 전기(Elec) | 전기 (Elec) |
| 안전(HSE) | 안전 |

- 건축 3명: Chathuranga, Sher Ali, Tharanga
- 설비 3명: Janaka, Nazeer, Shaheer
- 전기 3명: Medhan, Harshana, Hari
- 안전 13명: Anfas, Mohammad Mohsin(이상 Staff), Mohamed Rimzan, Ramesh, Samapath, Muhammad Usman, Ashrar Ali, Wasif Abbasi, Rizwan Ullah, SHAHZEB, Wahab, Sahibzada Asgher, shahzeb ali(이상 Officer)

한국 직원은 기존 CMS 사용자 정보의 팀·직책을 그대로 가져와 채웁니다.

## 2) 화면 표시 방식 (제안)

입력자는 기록에 적힌 텔레그램 이름이 아니라 **텔레그램 ID로 명부를 찾아 등록된 이름과 부서**로 보여 줍니다.

- 기본 표기: `황태연 · 건축` / `Chathuranga · 건축` / `Anfas · 안전`
- 명부에 없는 ID: 기록에 적힌 이름 그대로 + ⚠ 표시, 손대면 "명부에 없는 입력자입니다" 안내
- 같은 사람이 이름을 여러 형태로 쓴 경우(`Abrar`/`Abrar Khan`, `황태언 HDEC`/`황태연`)도 ID 기준이라 하나로 합쳐집니다

## 3) HDEC 재점검 — 누가 낸 값인지 명확히

화면에 보이는 값 = 가장 마지막 제출(ACTIVE) 값이므로, 그 카드마다 다음을 붙입니다.

- **현재값 작성자 배지**: `확인 ▸ 이우영 · 설비 (16:05)` — 지금 보이는 수치를 낸 사람과 제출 시각
- **이력 배지**: 같은 카드에 앞선 제출이 있으면 `이전 2건` 회색 배지. 앞선 제출이 없으면 배지 없음
- **이력 배지 클릭 → 이력 패널**: 제출 시각 내림차순으로 작성자·부서·직종별 인원·소계를 나열하고, 맨 위 한 줄만 「현재 반영」, 나머지는 취소선과 「대체됨」 표시. 앞 값과 달라진 숫자에는 증감(+3 / −2) 표시
- **검증 대조 표**의 `HDEC Counter` 열도 같은 규칙(이름·부서 + 이전 제출 건수)으로 바꿉니다
- **협력사 보고(SUB)** 도 동일 로직을 씁니다. 협력사 쪽 대체 기록 38건도 같은 방식으로 보입니다

부서별 색 점(건축·전기·설비·안전)을 이름 앞에 찍어 표에서 한눈에 구분되게 합니다.

## 기술 메모

- 마이그레이션: `manpower_members`에 `position text`, `dept text` 추가(둘 다 NULL 허용). 봇이 쓰는 열·제약은 그대로.
- 명단 22건은 텔레그램 ID 기준 UPDATE(데이터 변경 도구 사용, 마이그레이션 아님).
- `v_manpower_cards`를 재정의해 `reporter_tg_id`(마지막 제출자), `submitted_at`(마지막), `superseded_count`를 함께 내보냅니다. ACTIVE 필터는 유지하고, 대체 건수는 같은 `(source, company, report_date, location, shift)`의 SUPERSEDED 행 수로 계산합니다. `v_manpower_daily`·`v_manpower_compare`는 이 뷰를 읽으므로 자동 반영되며, compare 뷰에는 `sub_reporter_tg_id`·`hdec_counter_tg_id`·대체 건수를 추가합니다.
- `getManpower` 응답에 `members`(telegram_id, name, dept, position) 목록을 추가하고, 화면은 ID→직원 맵으로 표기를 만듭니다. 표기 함수는 `src/lib/manpower-model.ts`에 `reporterLabel()`로 두고 현황·대조·추이 화면이 공유합니다.
- 이력 패널용 서버 함수 `getCardHistory({source, company, report_date, location, shift})` 를 `manpower.functions.ts`에 추가 — ACTIVE/SUPERSEDED 전부를 제출시각 내림차순으로 반환.
- 명부 화면(`members-panel.tsx`)에 직책·부서 열과 입력칸 추가, 부서는 건축/전기/설비/안전/공무 드롭다운.
- XLSX 내보내기의 보고자 열도 새 표기를 씁니다.
