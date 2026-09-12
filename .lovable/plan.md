# 안전 리포트 이미지(JPG) 자동 생성 — 작업 계획

봇이 텔레그램 메시지에 **사진(JPG)** 을 바로 붙여 보낼 수 있도록, 앱이 매일 리포트 이미지를 만들어 지금 PDF와 같은 방식으로 공개 주소로 제공합니다. PDF 링크도 그대로 함께 유지합니다.

## 확정된 요구사항
- 이미지 + PDF 둘 다 제공 (메시지에는 사진, 본문에 PDF 링크)
- 이미지는 **A4 크기에 맞춰 페이지 단위로 분할** (내용이 길면 2장, 3장)
- 한글·영문 각각 생성

## 만들 것

### 1) 이미지 생성
- 지금 PDF를 그리는 것과 **똑같은 구성·색**(제목, 지표 5개, 팀별·건물별, 위험작업 표, 공통 안전수칙, 서명란)으로 화면 그림을 만들고, 이를 JPG로 변환합니다.
- 한 장은 A4 세로 비율 그대로 1240×1754px. PDF와 **같은 위치에서 페이지가 나뉘어** 표·문단이 어정쩡하게 잘리지 않습니다.
- 저장 위치: 지금 PDF와 같은 보관함에 `safety/2026-09-12-ko-1.jpg`, `-ko-2.jpg`, `-en-1.jpg` … 순번으로 저장하고, 총 장수도 함께 기록합니다.
- 한글·영문 분석이 모두 끝나는 순간(자동 생성·「다시 분석」 모두) PDF와 함께 만들어집니다.

### 2) 봇 연계
- 봇이 읽는 공개 목록(`v_safety_telegram`)에 `jpg_ko_urls`, `jpg_en_urls`(순서대로 담긴 주소 목록)와 장수를 추가합니다. PDF와 동일하게 `?v=준비시각`이 붙어 옛 파일이 캐시되지 않습니다.
- 인증 없이 받아갈 수 있는 공개 주소 `/api/public/safety-image?day=…&lang=ko|en&page=1` 을 새로 만듭니다.
- 봇은 1장이면 `sendPhoto`, 여러 장이면 `sendMediaGroup`(앨범)으로 보내고 첫 장 설명글에 본문 + PDF 링크를 넣으면 됩니다. (봇 쪽 코드는 앱 범위 밖)

### 3) 화면
- Safety Report 화면의 내려받기 영역에 PDF와 함께 **이미지(JPG)** 링크를 추가합니다.
- 안전리포트 설정의 「PDF 재생성」 버튼은 이미지까지 함께 다시 만듭니다(라벨은 「문서·이미지 재생성」으로).

## 미리 알려 둘 점
- 텔레그램 사진은 **가로:세로 비율 20:1**, 용량 10MB 제한이 있습니다. 위험작업이 아주 많은 날은 이 한도를 넘을 수 있어, 그런 날은 봇이 사진 대신 파일로 보내도록 하는 편이 안전합니다(봇 쪽 판단). 앱은 이미지 높이가 한도를 넘으면 자동으로 품질·여백을 줄여 최대한 한 장에 맞춥니다.
- 서버에는 브라우저가 없어 화면 캡처는 불가능하므로, 글자·표·선을 직접 그려 이미지로 만듭니다. 결과물은 현재 PDF와 같은 모양입니다.

## 기술 메모
- `safety_reports`에 `jpg_ko_path`, `jpg_en_path` 컬럼 추가. `telegram_ready_at`은 공유.
- `src/lib/safety-image.server.ts` 신설: 기존 `safety-pdf.server.ts`의 레이아웃 계산을 공용 모듈로 뽑아 SVG 문자열을 생성 → `@resvg/resvg-wasm`로 래스터화(폰트는 지금 쓰는 버킷의 NanumGothic TTF를 `fontBuffers`로 주입) → 픽셀을 `jpeg-js`로 JPEG(품질 85) 인코딩.
- Worker 런타임 제약상 sharp/canvas 사용 불가. resvg는 WASM이라 Worker에서 동작하지만, 초기화 실패 시 대비로 PNG 직출력(`asPng`) 경로를 유지하고 실패해도 PDF 생성·발송은 영향받지 않도록 try/catch 분리.
- `publishSafetyPdfs`를 `publishSafetyAssets`로 확장(PDF 2개 + JPG 2개 업로드 후 경로·준비시각 갱신).
- `v_safety_telegram` 뷰에 `jpg_ko_url`·`jpg_en_url` 추가(`/api/public/safety-image?...&v=<ready_at>`), anon SELECT 권한 유지.
- 새 공개 라우트 `src/routes/api/public/safety-image.ts` — 기존 `safety-pdf.ts`와 같은 형태로 Storage 스트리밍(`image/jpeg`).

## 인수 확인
1. 리포트 생성 후 보관함에 `-ko.jpg`, `-en.jpg`가 생기고 로그아웃 상태에서 공개 주소로 열림
2. 공개 목록 뷰에 JPG 주소 2개가 `?v=` 와 함께 표시
3. 「다시 분석」 시 이미지도 갱신되고 `?v=` 값이 바뀜
4. Safety Report 화면에서 PDF·JPG 모두 내려받기 가능
5. 이미지 내용이 현재 PDF와 동일(한글 깨짐 없음)
