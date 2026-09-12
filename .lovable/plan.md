# 사이드바 메뉴 재구성 및 섹션 음영

## 목표
사이드바 섹션/페이지 순서와 이름을 정리하고, 섹션별 음영을 주어 시인성을 높인다.

## 변경 대상
`src/components/app-shell.tsx` 의 NAV / DATA_NAV / ADMIN_NAV / SAFETY_NAV 상수와 `navList` 렌더 로직. 라우트 파일 자체는 그대로 (이동 없음).

## 새 메뉴 구조

```text
공정현황              (현황 → 공정현황 으로 개명)
  대시보드            /dashboard
  네트워크 공정표      /network        (네트워크 → 네트워크 공정표)
  지연 리스트         /delays         (공정 섹션에서 이동)
  공정 리스트         /schedule       (공정리스트 → 공정 리스트)
  Progress Report     /report

시운전 현황           (시운전 (T&C) → 시운전 현황)
  T&C Progress        /tc/progress    (맨 위로)
  MECH T&C            /tc/mech
  ELEC T&C            /tc/elec
  T&C List            /tc/list

안전현황              (신규 섹션)
  오늘의 주요작업      /today          (오늘의 주요 작업 → 오늘의 주요작업)
  Safety Report       /safety-report

Manpower 현황         (Daily Manpower 관리 → Manpower 현황)
  출면 현황           /manpower
  출면 추이           /manpower/trend
  검증 대조           /manpower/compare

관리                  (admin/safety-lead 게이트 유지)
  CMS 사용자 관리     /users
  출면관리            /manpower/admin
  안전리포트 설정     /safety-settings

데이터
  업로드              /upload
```

주의: 기존 “공정” 섹션은 해체 — 지연 리스트/공정 리스트는 공정현황으로, 나머지는 시운전 현황으로 이동. “오늘의 주요 작업”과 “Safety Report”는 현황에서 안전현황으로 이동.

## 권한 게이트 유지
- 관리 섹션: 기존대로 `isAdmin` → ADMIN_NAV, `isSafetyLead` → SAFETY_NAV(안전리포트 설정만) 분기 유지.
- 그 외 섹션은 전체 로그인 사용자 노출 유지.
- 접근 권한/RLS/서버 검증 변경 없음.

## 섹션 음영 디자인
`navList`에서 각 섹션 그룹을 별도 패널로 감싸 시인성 부여:
- 섹션 컨테이너: `rounded-lg border border-border/60 bg-muted/30 px-1.5 py-2 mb-2`
- 섹션 라벨: `px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground`
- 축소(아이콘) 모드에서는 라벨 숨김, 음영만 유지.
- 다크모드 대비 확인 (`bg-muted/30`는 토큰 기반이므로 자동 대응).
- 모바일 Sheet 내비에도 동일 스타일 적용.

## 기대 효과
- 섹션이 시각적으로 분리되어 메뉴 탐색성 향상.
- 이름/순서가 요청과 일치.
