# 출면 숫자 정합성 일괄 수정 계획

전수조사에서 확인된 4건의 불일치와 1건의 잠재 위험을 한 번에 정리합니다. 저장된 원본 기록은 손대지 않고, 집계·표시 방식만 바로잡습니다.

## 1. 검증 대조의 당사 숫자 부풀림 (최우선)

- 증상: 9/16 당사 재집계 총원이 현황 1,030명 / 대조표 1,642명. 75칸 중 43칸 불일치.
- 원인: 대조 집계가 재점검으로 무효 처리된(대체된) 기록까지 유효값으로 더함.
- 수정: 대조 집계를 현황과 동일하게 **유효 기록만** 사용하도록 통일. 같은 회사·날짜·장소·조에 여러 재집계가 있으면 가장 최신 유효 건 하나만 채택.
- 함께 바로잡히는 값: 차이(Diff), 일치율, 검증 커버리지 KPI, 상단 Total 행.

## 2. 추이 화면의 연인원과 세부 내역 범위 불일치

- 증상: 상단 연인원은 조 필터(기본 주간)를 반영하는데, 아래 세부 내역·연인원 표·일일 투입 평균은 전 조 기준.
- 수정: 화면 전체가 하나의 조 필터를 따르도록 통일하고, 선택된 조를 제목 옆에 항상 표기.

## 3. 비활성 협력사로 인한 보고 준수율 왜곡

- 증상: 보고한 회사 수(분자)에는 비활성 회사(HANMAEK, MAS ECC)가 포함될 수 있는데, 대상 회사 수(분모)는 활성 회사만 셈 → 100% 초과 가능.
- 수정: 분자·분모 모두 해당 날짜에 활성인 회사 기준으로 계산. 비활성 회사가 보고한 경우 표에는 남기되 준수율 계산에서는 제외하고 "대상 외" 표시.

## 4. "차이" 표기가 오해를 부르는 문제

- 증상: 아직 재집계하지 않은 분량(오늘 105건 중 66건만 재집계)이 "차이"로 표시되어 오류처럼 보임.
- 수정: 재집계 기록이 없는 건은 차이 대신 **미확인**으로 표기하고, 요약 카드도 "차이 합계"와 "미확인 분량"을 분리해 보여줌.

## 5. 잠재 위험: 한 번에 1,000행까지만 조회

- 증상: 기간을 넓히면(90일·전체) 경고 없이 일부 기록이 빠진 채 집계됨. 현재 7일치가 이미 888행.
- 수정: 기간 전체를 나눠서 끝까지 가져오도록 변경.

## 확인 방법

수정 후 9/14·9/15·9/16 세 날짜에 대해 현황·검증 대조·추이·대시보드의 총원·차이·준수율·커버리지를 데이터베이스 집계값과 대조해 모두 일치하는지 확인하고, 90일·전체 기간에서도 누락이 없는지 확인합니다.

## 기술 메모

- 대조 집계: `v_manpower_compare` 를 `status='ACTIVE'` 기준 + `(company, report_date, location, shift, source)` 최신 1건(`DISTINCT ON ... ORDER BY submitted_at DESC`)으로 재정의. `v_manpower_cards` 와 동일한 alias 정규화(`company_c`/`location_c`) 적용. 마이그레이션은 `CREATE OR REPLACE VIEW` + `security_invoker = on` 유지, 뷰 GRANT 재확인.
- `verified = COALESCE(hse_verified, exe_verified)` 는 유지하되, 두 소스 합산이 아님을 주석으로 명시하고 HSE/EXE 칼럼은 분리 유지.
- `manpower.trend.tsx`: `selectedSub`/`groupOnly` 를 `filtered` 기반으로 교체해 `shiftCode` 를 일관 적용. 일일 투입 평균·하단 표 동일 소스 사용.
- `manpower-model.ts`: 준수율 계산에 날짜별 활성 여부(`manpower_companies.active_from/active_to/is_active`) 반영, `reportingCompanies` 를 활성 집합과 교집합으로 산출.
- 미확인 구분: 모델에서 `result` 에 `PENDING`(HDEC 기록 없음) 분기 추가, `compare` 화면 칩·정렬·XLSX 열에 반영.
- `manpower.functions.ts` `getManpower`: `v_manpower_cards`·`v_manpower_compare` 조회를 1,000행 단위 `.range()` 루프로 감싸 전량 수집(공용 헬퍼 1개로 처리).
- 작업 후 `bun x tsgo --noEmit` 및 Playwright 로 `/manpower`, `/manpower/compare`, `/manpower/trend`, `/dashboard` 검증.
