# NCR 단계별(Progress Stage) 관리 — 리스트 페이지 + 대시보드

## 배경
- 원본: `Master(NCR+OR+SOR)` 시트, 기준일 2026-09-12, 100건
- 단계: PS1~PS9 × (S/F) = 18개 슬롯, 각 슬롯에 계획일(P)/실적일(A)
- 사용자 확정 사항:
  1. 9개 단계 모두 화면에 표시(계획 수립 중, 전 단계 사용)
  2. 현재단계는 스테이지 코드 자동 산출 (예: PS2F 실적 채워지면 → PS3S)
  3. 선행 강제: 위반 **행만 반려**(전체 업로드 차단 금지), 사유를 한글/영문 병기 안내
  4. 협력사 표기: 출면업체·공정리스트 표기로 자동 보정 매핑(공백/오탈자 정규화)

## 확정된 추가 결정
- **계획일도 순서 검사(행 차단)**: 계획일·실적일 모두 슬롯 순서(PS1S→…→PS9F)를 위반하면 반려. (반려 기준: 이전 슬롯 날짜보다 뒤 슬롯 날짜가 이르면 위반)
- **단계 건너뛰기**: 현재는 허용 + 경고 뱃지(「건너뛴 단계」). 정식 운용 전환 시 1회 마이그레이션으로 차단 모드 전환 예정(설정값으로 토글).
- **편집 권한**: NCR 행의 MIC·PIC 이름과 로그인 사용자(profiles.full_name)가 일치하면 자신의 담당 행만 편집 가능. 관리자는 전체 편집. 업로드는 관리자만(기존 업로드 화면 패턴 재사용).

## DB 설계 (마이그레이션 1건)
- `ncr_items` 테이블:
  - 기본: id, ser_no, doc_type, doc_no(유니크 후보), description, location, issued_by, issued_date, team, mic, pic, subcontractor, status, current_stage_file(원본 텍스트 참고용), source_file, file_date, hidden_at/hidden_source_date(공정표와 동일한 보관 방식), created_at
  - 단계: ps1s_p, ps1s_a, ps1f_p, ps1f_a, … ps9s_p, ps9s_a, ps9f_p, ps9f_a (36개 date 컬럼)
- GRANT(authenticated/service_role) + RLS:
  - SELECT: 로그인 사용자 전체
  - INSERT/UPDATE/DELETE: 서버 함수 경유(service_role), 앱에서 MIC/PIC/관리자 검증
- 협력사 보정: `company_disciplines`(별칭 테이블) 재사용 — 정규화 키(공백·대소문자 제거)로 canonical 표기 매핑, 실패 시 확인창 목록 표시

## 앱 구현
1. **파서** `src/lib/import-ncr.ts`
   - 3단 헤더(단계명 → PS1S/… 코드 → 계획/실적) 파싱, 기준일 셀 읽기
   - 슬롯 순서 검증(계획+실적), 현재단계 자동 산출, 협력사 정규화 매핑
   - 현재단계 로직: 실적일이 채워진 마지막 슬롯의 다음 슬롯. 전부 비면 PS1S, PS9F까지 채워지면 종결(Closed)
2. **서버 함수** `src/lib/ncr.functions.ts`
   - `importNcrItems`: doc_no 기준 upsert(공정표와 동일한 업데이트 방식), 파일에서 빠진 행은 보관(숨김), 위반 행 반려 목록 반환(한/영 사유)
   - `updateNcrItem`: MIC/PIC 일치 또는 관리자만, 선행 슬롯 실적 없으면 서버에서도 차단(한/영 메시지)
   - `getNcrItems`, `getNcrDashboard` 집계
3. **NCR 리스트 페이지** `/ncr`
   - QAIL형 필터(공종/협력사/현재단계/상태), 정렬, 컬럼 설정, XLSX 출력
   - 18슬롯은 행 확장 또는 단계 매트릭스 형태로 표시, MIC/PIC 담당 행만 인라인 편집 가능
   - 건너뛴 단계 경고 뱃지 표시
4. **NCR 대시보드** `/ncr/dashboard`
   - KPI 카드: 총 건수, 종결/진행, 단계별 진행 현황(PS별 잔여), 지연(계획완료 경과 미실적)
   - 단계별 진척 차트, 협력사별 현황
5. **업로드 연동**: 기존 업로드 페이지에 NCR 워크북 자동 인식 추가. 확인창에 반려 행(문서번호·위반 슬롯·한/영 사유) 표시, 정상 행만 적용. T&C 패턴과 별도로 NCR kind 추가.
6. **사이드바**: NCR 섹션 추가(리스트/대시보드)

## 기술 메모
- 테이블: `public.ncr_items` (GRANT→RLS 순서 준수)
- 서버 함수는 createServerFn, requireSupabaseAuth 사용
- 날짜는 date 컬럼, 엑셀 시리얼 변환은 기존 import-schedule 로직 재사용
- 현재단계 산출은 파서와 동일 로직을 공용 모듈(`ncr-model.ts`)로 분리해 화면/서버가 공유
- 반려 사유 메시지 포맷: `PS3S 실적일이 PS2F 실적일보다 빠릅니다 / PS3S actual date precedes PS2F actual date`
- types.ts는 마이그레이션 도구가 재생성

## 검증
- 타입 검사 통과
- 샘플 파일 업로드 → 정상 행 적용 + 위반 행 반려 목록 확인(현재 파일의 건너뛰기 행은 경고만)
- MIC/PIC 계정으로 자신의 행만 편집 가능 확인
