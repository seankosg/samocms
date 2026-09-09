# 안전위험분석 자동 생성 (제다 00:01)

수동 버튼 대신, 매일 제다 현지시간 00:01에 서버가 자동으로 당일 안전위험분석을 만들어 저장합니다.
사용자는 오늘의 주요작업 페이지를 열면 이미 만들어진 결과를 바로 봅니다.

## 동작

1. 매일 제다 00:01(UTC 21:01)에 서버가 당일 공정·T&C 작업 목록을 모아 AI 안전 분석을 실행하고 결과를 저장합니다.
2. 오늘의 주요작업 페이지는 저장된 당일 결과를 자동으로 불러옵니다.
   - 페이지가 열려 있는 상태로 날짜가 바뀌면(제다 기준 자정) 화면이 자동으로 새 날짜로 갱신되고 결과를 다시 조회합니다.
   - 아직 결과가 없으면 "자동 분석 대기 중" 안내를 표시하고, 잠시 후 자동 재조회합니다.
3. "다시 분석" 버튼은 관리자 계정에게만 표시됩니다(현재와 동일). 일반 사용자에게는 버튼·안내 문구 없이 결과만 보입니다.

## 기술 사항

- 새 서버 라우트 `src/routes/api/public/cron/safety-daily.ts`
  - `authenticateCronRequest`(기존 `src/integrations/supabase/cron-auth.ts`)로 호출자 검증
  - 제다 기준 오늘 날짜 산출 → `supabaseAdmin`으로 `activities`, `tc_items` 조회
  - 기존 `splitToday` / `todayTc` / `safetyFacts` 로직을 재사용하기 위해 해당 분류·요약 부분을 서버에서도 쓸 수 있게 `today-model.ts`(순수 함수) 그대로 import
  - AI 호출·파싱·정규화 로직은 `safety.functions.ts`의 프롬프트/파서를 공용 헬퍼(`src/lib/safety-core.server.ts`)로 분리해 서버 함수와 cron 라우트가 공유
  - 결과를 `safety_reports`에 `day` 기준 upsert (`created_by`는 null)
  - 이미 당일 결과가 있으면 재생성하지 않고 종료(중복 AI 호출 방지)
- pg_cron 스케줄 등록: `select cron.schedule('safety-daily','1 21 * * *', ...)`로 위 라우트를 `pg_net`으로 호출(고정 URL `project--<id>.lovable.app`, Authorization Bearer `LOVABLE_CRON_SECRET`)
- `src/routes/_authenticated/today.tsx`
  - 자정 롤오버 감지: 1분 간격 타이머로 `jeddahToday()` 재계산, 값이 바뀌면 날짜 state 갱신 → 공정·T&C·안전 쿼리 자동 재조회
  - 저장된 결과가 없을 때 `refetchInterval`(예: 60초)로 대기 재조회, 안내 문구 표시
  - "다시 분석" 버튼은 `isAdmin`일 때만 렌더(유지), 비관리자 대상 안내 문구는 제거
- 수동 분석 서버 함수(`analyzeSafety`)는 관리자 재분석용으로 유지
