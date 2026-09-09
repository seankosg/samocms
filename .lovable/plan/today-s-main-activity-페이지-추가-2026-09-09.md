# Today's Main Activity 페이지 추가

사이드바 "현황" 그룹에서 대시보드 바로 다음에 **오늘의 주요 작업** 메뉴를 추가합니다.
이 화면만은 기준일 설정과 무관하게, **앱을 여는 시점의 카타르 현지 날짜(UTC+3)** 를 기준으로 동작합니다.

## 화면 구성

상단에 오늘 날짜(예: 2026-09-09 (수) · 카타르 현지 기준)와 요약 숫자 4개를 배치합니다.
신규 착수 / 지속 진행 / 금일 종결 / 오늘 계획된 T&C 건수.

### 1) Today's Activities — 공정

오늘 날짜와 각 항목의 시작일·종료일을 비교해 세 그룹으로 나눕니다.

- **금일 신규 착수**: 시작일 = 오늘
- **금일 종결**: 종료일 = 오늘
- **금일 지속 진행**: 시작일 < 오늘 < 종료일

각 그룹은 접었다 펼 수 있는 섹션 카드로 표시하고, 표에는
공종·건물·Room·Activity·Milestone·협력사·수량(Done/Total)·계획%·실적%·시작~종료(dd-mmm)·상태 배지를 담습니다.
계획 대비 실적이 뒤처진 행은 기존 지연 표기 규칙과 동일하게 강조합니다.
행 클릭 시 기존 공정리스트(`/schedule`)로 해당 항목이 필터된 상태로 이동합니다.

### 2) Today's T&C

`tc_items`의 각 단계(T0 / T1 / Report / RFI / T2 / Response) 계획일이 오늘인 항목을 모아
단계별로 그룹화해 표시합니다. 건물·Group·Item·Equipment·수량·공급사·계획일·완료 여부(잔여 수량 기준)를 표로 보여주고,
클릭 시 `/tc/list`로 해당 조건이 필터된 상태로 이동합니다.

### 3) Safety Focused Activities

버튼("안전 위험 분석")을 눌렀을 때 실행됩니다(자동 실행 없음 — 불필요한 AI 사용 방지).
오늘 해당하는 공정·T&C 항목 목록을 AI에 전달해, 안전상 주의가 필요한 **High Risk 작업**을 선별합니다.

- 각 결과 항목: 위험 등급(High/Medium), 대상 작업명·건물·협력사, 위험 요인, 권고 안전 조치
- 고소작업, 중량물 양중, 전기 활선, 밀폐공간, 화기작업, 시운전 중 기계·전기 가동, 동시작업 간섭 등을 중점 판단
- 결과는 카드 리스트로 표시하고, High는 빨강 계열, Medium은 주황 계열로 구분
- 분석 결과는 화면 상태로만 유지(DB 저장 없음), 재실행 버튼 제공
- AI 실패 시(크레딧 부족·요청 과다 등) 한국어 안내 메시지 표시

## 권한

전체 사용자(Admin·User·Guest) 조회 가능. 데이터 변경 기능은 없습니다.

## 기술 사항

- 새 route: `src/routes/_authenticated/today.tsx` (`/today`), `head()`에 고유 title/description/og 메타 지정
- 데이터는 기존 `projectQuery`(`useProject`)를 재사용 — 추가 DB 테이블·마이그레이션 없음
- 오늘 날짜: `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" })` 로 `YYYY-MM-DD` 산출.
  SSR/클라이언트 hydration 불일치를 피하기 위해 날짜 계산은 `useEffect`/`useHydrated` 이후 확정
- 분류·집계 로직은 `src/lib/today-model.ts`로 분리(순수 함수, 테스트 용이)
- 안전 분석 서버 함수: `src/lib/safety.functions.ts`
  - `createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])`, Zod 입력 검증
  - Lovable AI Gateway `google/gemini-3.8-flash`(기존 리포트 요약과 동일 경로) 사용, 구조화된 JSON 결과 요청
  - 429/402/5xx 등 상태별 한국어 오류 메시지 처리
- 사이드바 `NAV`의 "현황" 그룹에 대시보드 다음 위치로 항목 추가(아이콘: `CalendarClock`)
- 드릴다운은 기존 `src/lib/list-search.ts`의 검색 파라미터 체계를 그대로 사용
