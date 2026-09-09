# 안전 분석 카드에 위험 유형 뱃지 추가

Today's Main Activity의 Safety Focused Activities 카드 왼쪽에 위험 종류(낙하·전도·감전 등) 뱃지를 표시합니다.

## 변경 내용

1. **AI 응답에 위험 유형 필드 추가** (`src/lib/safety.functions.ts`)
   - `SafetyRisk` 타입에 `hazardType: string[]` 추가 (예: ["낙하", "전도"])
   - 시스템 프롬프트의 JSON 형식에 `"hazardType":["낙하","전도"...]` 필드 추가
   - 유형 목록을 표준 건설 안전 분류로 고정하도록 프롬프트에 명시:
     낙하·추락, 전도, 붕괴, 낙하물·비래, 감전, 화재·폭발, 질식·밀폐공간, 협착, 기계·장비, 감김·절단, 유해화학물질, 기타
   - 파싱 시 배열 유효성 검증, 미응답 시 빈 배열로 처리

2. **카드 UI에 뱃지 렌더링** (`src/routes/_authenticated/today.tsx` SafetyBlock)
   - 카드 좌측(제목 행 왼쪽 또는 본문 좌측 세로 스택)에 위험 유형 뱃지 표시
   - 위험 유형별 고정 색상 매핑 (낙하=파랑 계열, 감전=노랑, 화재=빨강, 기계=회색 등) — 시맨틱 토큰 사용
   - 기존 High/Medium 레벨 뱃지는 유지, 레벨 뱃지와 시각적으로 구분되는 outline 스타일

## 검증
- `bunx tsgo --noEmit` 통과
- `/today`에서 안전 위험 분석 실행 후 뱃지 표시 확인 (Playwright)
