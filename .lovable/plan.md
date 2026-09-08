# T&C 단계별 일자 증분 기록 (Progress Trend용)

T&C 각 단계(T0, T1, RP, RFI, T2, Response)의 **당일 계획/실적 증분**을 항목별·날짜별로 DB에 자동 저장합니다. 공정리스트의 일일 증분 기록과 같은 방식으로 Progress Trend에서 바로 쓸 수 있게 합니다.

## 계산 규칙

- 기준: **단계 날짜 기준**
  - 어떤 항목의 T0 계획일이 9월 7일이면 → 9월 7일의 T0 "계획 1건, 계획 수량 = 해당 항목 qty"
  - 실적일이 9월 8일이면 → 9월 8일의 T0 "실적 1건, 실적 수량 = qty"
- 단위: **건수 + 수량(qty)** 두 가지 모두 기록
- 범위: **항목별 상세**(항목 × 단계 × 날짜), 공종·건물·그룹·업체 정보를 함께 담아 어떤 축으로든 합산 가능
- 대상 단계: T0, T1, RP, RFI, T2, Response 전 단계
- 계획일이 미래인 항목도 기록되므로 향후 계획 곡선(S-curve) 표현 가능

## 자동 기록 시점

- T&C 파일을 업로드할 때마다 해당 공종의 기록을 다시 계산해 갱신
- 인라인 수정으로 단계 날짜가 바뀌어도 반영되도록 갱신 함수를 호출
- 기존에 저장된 T&C 자료 전체에 대해 최초 1회 일괄 집계 실행

## 화면 변화

이번 작업은 데이터 적재만 수행하며, 기존 화면 동작은 그대로 유지됩니다. Progress Trend 화면은 다음 단계에서 이 기록을 사용합니다.

## 기술 상세

1. 마이그레이션: `public.tc_daily_progress` 테이블 추가
   - 컬럼: `event_date`, `discipline`, `item_key`, `stage`(t0/t1/rp/rfi/t2/resp), `bldg`, `grp`, `item`, `equip`, `supplier`, `qty`, `plan_count`, `plan_qty`, `actual_count`, `actual_qty`, `source_file`, `file_date`, `updated_at`
   - `UNIQUE (event_date, item_key, stage)`, `event_date`/`discipline`/`stage` 인덱스
   - RLS 활성화 + `authenticated` SELECT 정책, `authenticated` GRANT SELECT, `service_role` GRANT ALL (시퀀스 포함)
2. `public.refresh_tc_daily(_discipline text default null)` (SECURITY DEFINER, service_role 실행 권한)
   - 현재 `public.tc_items`(공종 필터 가능)를 원본으로, 6개 단계 × (계획일, 실적일)을 `unnest`로 펼쳐 날짜가 있는 조합만 upsert
   - 해당 공종의 기존 행 중 더 이상 존재하지 않는 (항목, 단계, 날짜) 조합은 삭제하여 재업로드 시 정합성 유지
3. `src/lib/tc.functions.ts`의 T&C 임포트 및 인라인 수정 저장 경로에서 `supabaseAdmin.rpc("refresh_tc_daily", { _discipline })` 호출 (실패해도 업로드 자체는 성공 처리, 콘솔 기록)
4. 기존 자료 일괄 집계: service role로 `refresh_tc_daily(null)` 1회 실행 후 날짜별 건수 검증
5. `bunx tsgo --noEmit` 타입 검사

## 참고

`tc_snapshots`에 남아 있는 과거 업로드본은 그대로 보존됩니다. 이번 기록은 "현재 확정된 단계 일정" 기준이며, 파일 기준일별 변화 이력이 추가로 필요하면 이후 별도 작업으로 확장할 수 있습니다.
