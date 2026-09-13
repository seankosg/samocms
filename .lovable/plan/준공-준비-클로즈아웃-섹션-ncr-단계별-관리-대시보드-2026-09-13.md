# 준공 준비(클로즈아웃) 섹션 — NCR 단계별 관리 + 대시보드

## 배경
- 원본: `Master(NCR+OR+SOR)` 시트, 기준일 2026-09-12, 100건
- 단계: PS1~PS9 × (S/F) = 18개 슬롯, 각 슬롯에 계획일(P)/실적일(A)
- 사용자 확정 사항:
  1. 9개 단계 모두 화면에 표시(계획 수립 중, 전 단계 사용)
  2. 현재단계는 스테이지 코드 자동 산출 (예: PS2F 실적 채워지면 → PS3S)
  3. 선행 강제: 위반 **행만 반려**(전체 업로드 차단 금지), 사유를 한글/영문 병기 안내
  4. 협력사 표기: 출면업체·공정리스트 표기로 자동 보정 매핑(공백/오탈자 정규화)

## 확정된 추가 결정
- **계획일도 순서 검사(행 차단)**: 계획일·실적일 모두 슬롯 순서(PS1S→…→PS9F)를 위반하면 반려.
- **단계 건너뛰기**: 현재는 허용 + 경고 뱃지(「건너뛴 단계」). 정식 운용 전환 시 설정값으로 차단 모드 전환.
- **편집 권한**: NCR 행의 MIC·PIC 이름과 로그인 사용자(profiles.full_name)가 일치하면 자신의 담당 행만 편집. 관리자는 전체 편집. 업로드는 관리자만.
- **측정 단위**: 각 행 = 1건, 건수로만 집계(수량 개념 없음).
- **섹션 노출**: 사이드바에 **「준공 준비」** 섹션을 「Manpower 현황」 다음에 신설하고, **관리자(Admin)에게만** 노출(기존 AdminGate 패턴 재사용). 비관리자는 메뉴·라우트 모두 접근 불가.

## DB 설계 (마이그레이션 1건)
- `ncr_items` 테이블:
  - 기본: id, ser_no, doc_type(NCR/OR/SOR), doc_no(유니크), description, location, issued_by, issued_date, team, mic, pic, subcontractor, status, current_stage_file(원본 참고용), source_file, file_date, hidden_at/hidden_source_date(공정표와 동일한 보관 방식), created_at
  - 단계: ps1s_p, ps1s_a, ps1f_p, ps1f_a, … ps9s_p, ps9s_a, ps9f_p, ps9f_a (36개 date 컬럼)
- GRANT(authenticated/service_role) + RLS: SELECT 로그인 사용자 전체, 쓰기는 서버 함수 경유
- 협력사 보정: `company_disciplines` 별칭 테이블 재사용(정규화 키 매핑)

## 앱 구현
1. **공용 모델** `src/lib/ncr-model.ts`
   - 슬롯 배열(PS1S…PS9F), 현재단계 산출(실적 채워진 마지막 슬롯의 다음 슬롯, 모두 비면 PS1S, PS9F 채워지면 종결), 순서 검증, 지연 판정, 건너뛴 단계 목록
2. **파서** `src/lib/import-ncr.ts`
   - 3단 헤더(단계명 → PS1S… → 계획/실적) 파싱, 기준일 읽기, 협력사 정규화 매핑
3. **서버 함수** `src/lib/ncr.functions.ts`
   - `importNcrItems`: doc_no 기준 upsert + 파일에서 빠진 행 보관(숨김), 위반 행 반려 목록 반환(한/영 사유)
   - `updateNcrItem`: MIC/PIC 일치 또는 관리자만, 선행 슬롯 미완료 시 서버에서도 차단
   - `getNcrItems`(숨김 제외), 대시보드 집계는 클라이언트에서 건수 기반 계산
4. **NCR 리스트 페이지** `/ncr`
   - QAIL형 필터: **문서종류(NCR/OR/SOR)** · 팀 · 협력사 · 현재단계 · 상태, 검색, 정렬, 컬럼 설정, XLSX 출력
   - 18슬롯은 행 확장/단계 매트릭스로 표시, MIC/PIC 담당 행만 인라인 편집, 건너뛴 단계 경고 뱃지
5. **NCR 대시보드** `/ncr/dashboard` — QAIL ABD 대시보드 상단 2행 + Spare Part 카드 아이디어 이식
   - 상단 필터: 기준일(as-of) · 문서종류 · 팀 · 협력사(탭형 칩)
   - **1행 Progress Stage**: PS1~PS9 카드 9장. 각 카드 안은 Start / Finish 두 구역으로 나뉘고 각각 Plan(기준일까지 계획 도래 건수) / Actual(실적 채워진 건수) 표시. 카드 하단 얇은 진행 막대(완료율). 수치 클릭 시 리스트 드릴다운.
   - **2행 지연 현황**: 같은 9열 정렬. 각 PS 카드에 지연 건수(Start 지연 / Finish 지연 구분: 계획일 경과 & 실적 없음), 0이면 회색, 있으면 위험색. 클릭 시 해당 지연 리스트로 드릴다운.
   - **3행 현재단계 현황**: 각 PS별 현재 머물러 있는 건수(Current Stage 자동 산출값 기준으로 PS1~PS9 분포), 종결(Closed) 건수 포함. 카드 클릭 시 해당 단계 필터로 리스트 이동.
6. **업로드 연동**: 기존 업로드 페이지에 NCR 워크북 자동 인식(kind: "ncr"). 확인창에 반려 행(문서번호·위반 슬롯·한/영 사유) 표시, 정상 행만 적용.
7. **사이드바**: 「준공 준비」 섹션(Manpower 현황 다음) — NCR 대시보드 / NCR 리스트. 관리자에게만 표시.

## 기술 메모
- 테이블: `public.ncr_items` (GRANT→RLS 순서 준수), doc_no 유니크 인덱스(보관 행 제외 여부는 공정표와 동일 기준)
- 서버 함수는 createServerFn + requireSupabaseAuth, 관리자 검사는 has_role(admin), MIC/PIC는 profiles.full_name 비교
- 엑셀 시리얼 날짜 변환은 기존 import-schedule 로직 재사용
- 반려 사유 포맷: `PS3S 실적일이 PS2F 실적일보다 빠릅니다 / PS3S actual date precedes PS2F actual date`
- 관리자 전용: AppShell 메뉴 조건부 + 라우트에서 AdminGate 처리
- 각 라우트 고유 head() 메타, types.ts는 마이그레이션 도구가 재생성

## 검증
- 타입 검사 통과
- 샘플 파일 업로드 → 정상 행 적용 + 위반 행 반려 목록 확인(건너뛰기 행은 경고만)
- 3행 KPI 카드 수치와 리스트 드릴다운 건수 일치 확인
- 비관리자 계정에서 「준공 준비」 섹션 미노출 및 직접 접근 차단 확인
- MIC/PIC 계정으로 자신의 행만 편집 가능 확인
