# 안전 리포트 이미지(JPG) 자동 생성 — 작업 계획

봇이 텔레그램 메시지에 **사진(JPG)** 을 바로 붙여 보낼 수 있도록, 앱이 매일 리포트 이미지를 A4 페이지 단위로 만들어 공개 주소로 제공합니다. PDF도 지금처럼 그대로 유지합니다.

## 확정된 요구사항
- 이미지 + PDF 둘 다 제공. 본문(caption)에는 PDF 링크를 넣지 않고, 봇이 사진 뒤에 PDF 파일을 직접 보냅니다.
- 이미지는 **A4 크기에 맞춰 페이지 단위로 분할** (내용이 길면 2장, 3장)
- 한글·영문 각각 생성

## 만들 것

### 1) 이미지 생성
- 지금 PDF를 그리는 것과 **똑같은 구성·색**(제목, 지표 5개, 팀별·건물별, 위험작업 표, 공통 안전수칙, 서명란)으로 화면 그림을 만들고, 이를 JPG로 변환합니다.
- 한 장은 A4 세로 비율 그대로 1240×1754px. PDF와 **같은 위치에서 페이지가 나뉘어** 표·문단이 어정쩡하게 잘리지 않습니다.
- 저장 위치: 지금 PDF와 같은 보관함에 `safety/2026-09-12-ko-1.jpg`, `-ko-2.jpg`, `-en-1.jpg` … 순번으로 저장하고, 총 장수도 함께 기록합니다.
- 한글·영문 분석이 모두 끝나는 순간(자동 생성·「다시 분석」 모두) PDF와 함께 만들어집니다.

### 2) 봇 연계
- 봇이 읽는 공개 목록(`v_safety_telegram`)에 `img_ko_urls`, `img_en_urls`(페이지 순서대로 담긴 공개 주소 JSON 배열)와 장수를 추가합니다. PDF와 동일하게 `?v=준비시각`이 붙어 옛 파일이 캐시되지 않습니다.
- 인증 없이 받아갈 수 있는 공개 주소 `/api/public/safety-image?day=…&lang=ko|en&page=1` 을 새로 만듭니다.
- 봇은 1장이면 `sendPhoto`, 여러 장이면 `sendMediaGroup`(앨범)으로 보내고, 사진 뒤에 PDF를 파일로 이어 보냅니다. 설명글에는 PDF 링크를 넣지 않습니다. (봇 쪽 코드는 앱 범위 밖)

### 3) 화면
- Safety Report 화면의 내려받기 영역에 PDF와 함께 **이미지(JPG)** 링크를 추가합니다.
- 안전리포트 설정의 「PDF 재생성」 버튼은 이미지까지 함께 다시 만듭니다(라벨은 「문서·이미지 재생성」으로).

## 미리 알려 둘 점
- A4 한 장 비율이라 텔레그램 사진 제한(비율·용량)에는 여유가 있습니다. 여러 장일 때는 앨범으로 묶어 한 메시지처럼 보입니다.
- 서버에는 브라우저가 없어 화면 캡처는 불가능하므로, 글자·표·선을 직접 그려 이미지로 만듭니다. 결과물은 현재 PDF와 같은 모양입니다.

## 기술 메모
- `safety_reports`에 `jpg_ko_pages`, `jpg_en_pages`(정수, 장수) 컬럼 추가. 경로는 `safety/{day}-{lang}-{n}.jpg` 규칙으로 고정. `telegram_ready_at`은 공유.
- `src/lib/safety-image.server.ts` 신설: `safety-pdf.server.ts`의 그리기 로직을 페이지 단위 명령 목록으로 공용화해 PDF와 이미지가 **같은 페이지 분할**을 쓰도록 리팩터 → 페이지별 A4 SVG 생성 → `@resvg/resvg-wasm`로 1240×1754 래스터화(폰트는 버킷의 NanumGothic TTF를 `fontBuffers`로 주입) → `jpeg-js`로 JPEG(품질 85) 인코딩.
- Worker 런타임 제약상 sharp/canvas 사용 불가. resvg는 WASM이라 Worker에서 동작하지만, 초기화 실패 시 대비로 PNG 직출력(`asPng`) 경로를 유지하고 실패해도 PDF 생성·발송은 영향받지 않도록 try/catch 분리.
- `publishSafetyPdfs`를 `publishSafetyAssets`로 확장(PDF 2개 + 언어별 JPG N장 업로드, 이전 회차의 남는 페이지 파일 삭제, 경로·장수·준비시각 갱신).
- `v_safety_telegram` 뷰에 `jpg_ko_urls`·`jpg_en_urls`(text[] 또는 JSON 배열)와 `jpg_ko_pages`·`jpg_en_pages` 추가, 각 주소에 `?v=<ready_at>`, anon SELECT 권한 유지.
- 새 공개 라우트 `src/routes/api/public/safety-image.ts` — `day`·`lang`·`page` 검증 후 Storage 스트리밍(`image/jpeg`).

## 인수 확인
1. 리포트 생성 후 보관함에 `-ko-1.jpg` 등 A4 페이지 이미지가 생기고 로그아웃 상태에서 공개 주소로 열림
2. 공개 목록 뷰에 언어별 이미지 주소 목록과 장수가 `?v=` 와 함께 표시
3. 「다시 분석」 시 이미지도 갱신되고 `?v=` 값이 바뀌며, 장수가 줄면 남는 파일이 사라짐
4. Safety Report 화면에서 PDF·이미지 모두 내려받기 가능
5. 이미지의 페이지 나눔과 내용이 현재 PDF와 동일(한글 깨짐 없음)
