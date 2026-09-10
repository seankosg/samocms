# 출면 미보고 알림 설정 (Rev. 3-2) 적용 계획

## 검토 결과 — 문제 되는 점

지시서를 그대로 적용해도 **충돌하거나 막히는 부분은 없습니다.** 다만 세 가지만 짚어 둡니다.

1. `manpower_cutoff_time` 은 이미 값 `09:00` 으로 저장되어 있고, 출면 현황의 준수율 계산이 이 값을 씁니다. 새 화면에서 이 값을 바꾸면 준수율 기준도 같이 바뀝니다 — 지시서 의도와 같으므로 그대로 둡니다.
2. 근무일 달력은 **모든 날이 근무일(금요일 포함, 휴일 없음)**로 확정하셨습니다. 달력을 비워 두면 봇이 모든 날을 근무일로 판단하므로, 그대로 비워 두고 봇 측의 "금요일 제외" 안내 문구는 현장 방침에 맞게 조정합니다(화면 안내 문구에서도 금요일 발송 제외 부분은 빼고, "달력에 비근무일로 등록된 날에만 보내지 않음"으로 표기).
3. 화면에 보여 줄 "오늘 발송 횟수"는 봇이 기록을 남기기 시작해야 숫자가 보입니다. 그전까지는 0으로 표시됩니다.

## 만들 것

### 1. 데이터 준비
- 봇이 근무일 달력을 읽을 수 있도록 공개 읽기 권한을 엽니다.
- 알림 설정 3개 기본값을 넣습니다(이미 있으면 유지): 알림 사용 여부 `false`, 알림 시각 `09:00,11:00`, 보고 마감 `09:00`.

### 2. 알림 설정 카드 — 「출면 업체 장소 관리 설정」 화면 (관리자 전용)
화면 상단에 작은 카드를 추가합니다.
- **미보고 알림** 켜기/끄기 스위치
- **알림 시각** 입력 (예: `09:00,11:00`) — 저장할 때 형식이 맞는지 검사하고 틀리면 안내
- **보고 마감** 입력 (예: `09:00`)
- 저장 버튼 하나, 저장 후 안내 메시지
- 카드 아래 안내 문구: 1차는 알림·2차부터는 독촉, 금요일과 비근무일에는 발송 안 함, 최근 10일간 보고가 없는 회사는 휴면 처리해 경고 생략, 담당자 미등록 회사는 목록에만 표시

### 3. 출면 현황에 발송 횟수 표시
미보고 협력사 행 옆에 오늘 발송된 알림 횟수를 작은 뱃지로 보여 줍니다. 발송 기록이 없으면 표시하지 않습니다.

## 기술 메모

- 마이그레이션 `0012_manpower_reminder.sql`: `GRANT SELECT ON public.manpower_calendar TO anon` + `bot reads calendar` SELECT 정책, `app_settings` 3키 `ON CONFLICT DO NOTHING` 삽입.
- 서버 함수 `saveManpowerSettings` 를 `src/lib/manpower.functions.ts` 에 추가: `requireSupabaseAuth` + 기존 `assertAdmin` 후 service role 로 `app_settings` upsert(`updated_at` 갱신). 허용 키를 `manpower_reminder_enabled`, `manpower_remind_times`, `manpower_cutoff_time` 로 한정하고 Zod 로 `HH:mm`(쉼표 구분) 검사.
- 설정값은 이미 `getManpower` 의 `settings` 맵으로 내려오므로 별도 조회 불필요. 저장 후 `manpower`·`manpower-masters` 쿼리 무효화.
- 발송 횟수는 `manpower_ingest_log` 에서 `mode='reminder'` 이고 `warnings->>'date'` 가 오늘인 행을 세는 조회를 `getManpower` 에 추가(현재 로그 조회는 최근 5건 제한이라 별도 쿼리 필요). `warnings.missing` 배열에 회사명이 포함된 건만 회사별로 집계.
- 새 UI 문구는 `src/lib/manpower-i18n.ts` 에 모아 둡니다.
- 봇(Apps Script) 발송 로직은 앱 범위 밖 — 구현하지 않습니다.
- 완료 후 `bunx tsgo --noEmit` 타입 검사와 관리자 계정 브라우저 확인.
