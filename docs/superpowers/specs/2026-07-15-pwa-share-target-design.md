# 안심스캔 — PWA 설치 + 안드로이드 공유 대상(Share Target) 설계 문서

- Date: 2026-07-15
- Status: Draft (approved for planning) — 2026-07-15 리뷰 반영 개정
- 선행 문서: `2026-07-07-korean-scam-detector-design.md`(v1), `2026-07-13-v2-screenshot-analysis-and-ui-upgrade-design.md`(v2), `2026-07-14-result-caching-design.md`

> **개정 이력(2026-07-15 리뷰 반영)**: (1) 공유된 텍스트가 발신번호 없이 분석되도록 `SmsInputSchema.senderNumber`를 선택값으로 완화(§4a). (2) 브라우저의 `beforeinstallprompt`를 활용한 앱 내 "홈 화면에 추가" 설치 버튼 추가(§8). (3) 무료 사용량 한도 안내를 홈페이지 안내 UI에 포함(§8). (4) 서비스 워커가 이미지를 base64 data URL이 아닌 `Blob` 그대로 Cache Storage에 저장하도록 변경(§5, §6). (5) 서비스 워커 리다이렉트 URL을 절대 URL로, 공유 텍스트 추출을 `text → url → title` 순으로 보강(§5, §7). (6) §3 아키텍처 다이어그램을 실제 구현(쿠키 폴백)과 일치시킴. (7) 아이콘 생성 방식을 정정(`sips`는 SVG를 래스터화하지 못함 — §4). (8) 서비스 전체 대상 frontend-design 개편은 이 스펙 범위 밖의 후속 작업으로 분리(§11).

## 1. 개요 (Overview)

카카오톡/문자 메시지나 갤러리의 스크린샷을 확인하려면 지금은 사용자가 직접 안심스캔을 열고, 내용을 복사하거나 파일을 선택해서 붙여넣어야 한다. 안드로이드에서 안심스캔을 홈 화면에 설치(PWA)하면, 카카오톡 메시지를 길게 눌러 "공유"를 선택하거나 갤러리에서 스크린샷을 공유할 때 안심스캔이 공유 대상 목록에 직접 나타나도록 만든다 — 앱을 따로 열 필요 없이, 공유 한 번으로 분석 화면까지 도달한다. 설치 자체도 브라우저 메뉴를 뒤지지 않고 홈페이지의 "홈 화면에 추가" 버튼으로 바로 할 수 있게 한다.

**iOS 제약**: iOS Safari는 웹앱을 시스템 공유 시트의 대상으로 등록하는 기능(Web Share Target API) 자체를 지원하지 않으며, 설치 프롬프트(`beforeinstallprompt`)도 발생시키지 않는다 — 브라우저 차원의 제약이라 우회할 방법이 없다. iOS 사용자는 기존과 동일하게 수동으로 복사/붙여넣기 또는 업로드하는 흐름을 사용한다. 이 사실을 홈 화면에 명확히 안내한다.

## 2. 목표 / 비목표 (Goals / Non-goals)

**목표**:
- 안드로이드에서 안심스캔을 홈 화면에 설치할 수 있게 만든다(PWA manifest, 아이콘). 브라우저의 `beforeinstallprompt` 이벤트를 받아 홈페이지에 앱 내 설치 버튼을 노출한다.
- 설치된 안심스캔이 텍스트(카카오톡/문자 메시지)와 이미지(갤러리 스크린샷) 공유의 대상으로 시스템 공유 시트에 나타난다
- 공유된 내용은 (정상 경로에서) 서버에 닿기 전까지 기기 안에만 머문다 — 분석 전까지는 v1의 "무저장" 원칙이 공유 내용에도 동일하게 적용된다
- 공유된 내용은 폼에 미리 채워질 뿐, Turnstile 인증과 "분석하기" 클릭은 기존과 동일하게 사용자가 직접 수행한다 — 기존 어뷰징 방지 체계(Turnstile, IP rate limit, 전역 쿼터, 결과 캐시)를 전혀 건드리지 않는다
- 공유된 텍스트는 발신번호가 없이도 그대로 분석할 수 있어야 한다 — 공유 페이로드에는 메시지 본문만 있고 발신번호는 포함되지 않으므로, "공유 → 인증 → 분석하기"가 발신번호 입력 없이 완결되어야 한다(§4a)
- iOS에서는 지원되지 않는다는 사실, 안드로이드에서 이 기능을 사용하는 방법, 그리고 무료 서비스의 사용량 한도를 홈 화면에서 바로 확인할 수 있게 안내한다

**비목표**:
- iOS 공유 지원(브라우저 자체 제약으로 불가능), iOS Shortcuts 앱 연동
- 클립보드 붙여넣기 버튼(길게 눌러 붙여넣기로 이미 가능한 동작이라 판단, 범위에서 제외)
- 오프라인 지원 — 이 앱의 핵심 기능(Gemini/Groq 호출)은 네트워크가 필수이므로, 서비스 워커는 오직 공유 대상 처리와 설치 요건 충족만 담당하고 앱 셸/에셋을 미리 캐싱하지 않는다
- 여러 아이콘 테마, 다크 아이콘 변형 등
- **서비스 전체를 대상으로 하는 frontend-design 시각 개편** — 이 기능이 추가하는 UI(설치 버튼, 안내 컴포넌트)는 우선 기존 컴포넌트/패턴에 맞춰 구현하고, 서비스 전체의 현대적 디자인 개편은 이 스펙이 구현된 뒤 별도의 frontend-design 설계 사이클로 진행한다(§11). 그 개편이 이 기능이 추가한 UI도 함께 다듬는다.

## 3. 아키텍처 개요

```
[카카오톡/문자 메시지 길게 누르기 → 공유]  또는  [갤러리 → 사진 → 공유]
        │ (안드로이드 시스템 공유 시트)
        ▼
    "안심스캔" 선택 (설치된 PWA가 공유 대상으로 등록되어 있어 시트에 표시됨)
        │
        ▼
   POST /share-target (multipart/form-data: text/title/url 또는 이미지 파일)
        │
        ├─ [정상 경로] 서비스 워커의 fetch 핸들러가 이 요청을 가로챈다
        │    ├─ 공유된 텍스트 → JSON 메타로, 이미지 → Blob 그대로
        │    │   Cache Storage API에 저장 (기기 내부, 서버 미접촉)
        │    └─ 절대 URL(예: https://origin/?shared=1)로 리다이렉트
        │
        └─ [드문 예외 경로] 설치 직후 서비스 워커가 아직 활성화되지 않아
             네트워크로 실제 도달한 경우
             └─ 서버 Route Handler가 POST 본문을 그 자리에서 한 번 읽어,
                어디에도 저장하지 않고, 짧은 만료의 쿠키에 실어
                /?shared=1 로 리다이렉트한다(URL 쿼리에 내용을 싣지 않음)

   (양쪽 경로 모두) 홈페이지 로드 시 ?shared=1 을 감지해 공유된 내용을
   읽어 폼에 채운다 — 이미지는 기존 다운스케일 파이프라인을 그대로 거친다
        │
        ▼
   기존 흐름과 동일: Turnstile 인증 → "분석하기" 클릭 → /api/analyze
```

서비스 워커는 두 가지 역할만 담당한다: (1) 크롬의 PWA 설치 요건(fetch 이벤트 핸들러 존재) 충족, (2) `/share-target` POST 요청 가로채기. 앱 셸 프리캐싱이나 오프라인 지원은 하지 않는다.

## 4. Manifest 설계

`public/manifest.json`:

```json
{
  "id": "/",
  "name": "안심스캔",
  "short_name": "안심스캔",
  "description": "문자, 이메일, 스크린샷이 사기인지 AI로 확인하세요.",
  "lang": "ko",
  "dir": "ltr",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1a56db",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "share_target": {
    "action": "/share-target",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url",
      "files": [
        { "name": "images", "accept": ["image/jpeg", "image/png", "image/webp"] }
      ]
    }
  }
}
```

`theme_color`/`background_color`는 기존 CSS의 `--primary`(#1a56db, `globals.css`에서 확인)와 라이트 모드 배경(#ffffff)에 맞춘다. `files.accept`는 기존 `ImageUploader.tsx`의 `ACCEPTED_MIME_TYPES`(`image/jpeg`, `image/png`, `image/webp`)와 동일하게 맞춘다.

`public/manifest.json`은 정적 파일로 두고, `src/app/layout.tsx`의 `metadata` export에 `manifest: '/manifest.json'`을 지정해 `<link rel="manifest">` 태그를 내보낸다(Next.js 16에서 정적 `public/` manifest는 이 지정을 해야 태그가 나온다 — `app/manifest.*` 파일 컨벤션만 자동으로 태그를 주입한다). `theme_color`에 대응하는 `<meta name="theme-color">`는 `metadata`가 아니라 별도의 `viewport` export(`export const viewport: Viewport = { themeColor: '#1a56db' }`)로 내보낸다(Next 16에서 `metadata.themeColor`는 deprecated).

**아이콘 에셋**: 디자이너 없이 직접 제작한다 — 기존에 홈페이지에서 쓰이는 `ShieldCheck`(lucide-react) 모티프를 단순화한 그림을 `#1a56db` 배경 위에 흰색으로 얹은 아이콘을 만든다. **주의: `sips`는 SVG를 PNG로 래스터화하지 못한다**(SVG 디코더가 없다). 따라서 아이콘 원본을 HTML/CSS(또는 SVG를 담은 HTML)로 작성하고 macOS 내장 `qlmanage`로 PNG 썸네일을 생성한 뒤 `sips`로 정확한 크기(192/512)로 리사이즈한다. maskable 아이콘은 안드로이드 적응형 아이콘 규격(안전 영역 = 중앙 80% 원 안)에 맞춰 그림을 더 작게(캔버스의 ~45%) 그린 별도 파일로 만든다. `qlmanage`의 HTML 렌더링은 macOS 버전에 따라 크기·여백이 달라질 수 있으므로, 생성 후 결과 PNG가 정확한 정사각형 크기이고 배경이 불투명하며 그림이 중앙에 오는지 반드시 육안으로 확인한다. `qlmanage`가 신뢰할 만한 결과를 내지 못하면, 이 에셋들은 CI가 아니라 한 번만 생성해 저장소에 커밋하는 정적 파일이므로 Chrome 헤드리스 스크린샷 등 다른 방법으로 생성해도 무방하다. 어느 경우든 빌드 시점에 동적으로 생성하지 않는다.

## 4a. 발신번호(senderNumber) 스키마 완화 (핵심 변경)

현재 `SmsInputSchema.senderNumber`는 `z.string().min(1).max(50)`로 **최소 1자**를 요구한다(`types.ts`). 공유로 받은 카카오톡/문자 텍스트에는 메시지 본문만 있고 발신번호는 포함되지 않으므로, 공유 흐름은 문자(SMS) 탭 본문만 채우고 발신번호는 비운 채로 둔다. 이 상태로 "분석하기"를 누르면 서버의 `AnalysisInputSchema.safeParse`가 (Turnstile/rate limit보다 먼저) 실패해 "입력값이 올바르지 않습니다"(400)로 막히고, 클라이언트는 `finally`에서 Turnstile을 리셋해버려 사용자는 이유를 모른 채 인증만 날린다.

**변경**: `SmsInputSchema.senderNumber`를 빈 문자열을 허용하도록 완화한다(`z.string().max(50)` — `.min(1)` 제거). `buildUserContent`는 발신번호가 비어 있으면 `발신번호: (알 수 없음)`으로 렌더링한다. 이렇게 하면 공유된 텍스트가 발신번호 입력 없이 그대로 분석되고, 발신번호를 모르는 일반 수동 입력 사용자도 본문만으로 분석할 수 있다.

**분석 품질 영향**: 시스템 프롬프트는 발신번호 스푸핑을 여러 신호 중 하나로 다루지만, 본문만으로도 판정하도록 이미 설계되어 있다(예: "가족·지인 사칭" 항목은 "링크나 기관 도메인이 전혀 없어도 그 자체로 강한 위험 신호"라고 명시). 발신번호가 없으면 그 한 신호만 사용할 수 없을 뿐, 모델은 본문 기반 분석을 정상 수행한다. `resultCache`의 캐시 키는 `['sms', senderNumber, messageBody]` 배열이므로 빈 발신번호도 유효한(서로 구분되는) 키 값이라 캐싱에 영향이 없다.

**범위**: 이번 변경은 SMS의 `senderNumber`에만 적용한다. 이메일의 `senderAddress`(역시 `min(1)`)는 공유 흐름이 이메일 탭을 채우지 않으므로 이번 변경 대상이 아니다.

## 5. 서비스 워커 설계

`public/sw.js` (빌드 도구 없이 순수 JS로 작성 — Next.js 앱 자체를 위한 서비스 워커가 아니라 공유 대상 가로채기 전용의 얇은 레이어이므로, PWA 프레임워크를 새로 추가하지 않는다):

- `fetch` 이벤트 핸들러가 `POST /share-target` 요청만 가로챈다 — 그 외 모든 요청은 그대로 네트워크로 통과시킨다(오프라인 캐싱을 하지 않으므로).
- 요청 본문을 `FormData`로 파싱한다. 이미지 파일(`images`)이 있으면 이미지를 우선하고, 없으면 텍스트를 `text → url → title` 순으로 찾아 사용한다(일부 공유 앱은 텍스트를 `text`가 아닌 `url`/`title`에 담는다).
- **이미지는 base64 data URL로 변환하지 않고 `Blob` 그대로 저장한다.** 공유는 다운스케일 이전의 원본(수 MB일 수 있음)에 대해 일어나므로, 서비스 워커에서 base64로 인코딩하면 메모리·연산 낭비가 크고 Cache Storage도 비대해진다. 대신 각 이미지 Blob을 `Response`로 감싸 별도 키(예: `/shared-image-0`, `/shared-image-1` …)로 저장하고, 텍스트/개수 등 메타데이터는 작은 JSON(`/shared-meta`)으로 저장한다. Blob의 MIME 타입은 `Response`가 보존하므로 클라이언트가 그대로 `File`로 되돌릴 수 있다.
- 저장을 마친 뒤 **절대 URL**로 리다이렉트한다: `Response.redirect(new URL('/?shared=1', self.location.origin).href, 303)`. (상대 URL은 구현에 따라 `TypeError`를 던진 전례가 있어, 서버 폴백과 동일하게 절대 URL로 통일한다.)
- 기존에 공유받은 내용이 캐시에 남아있다면(사용자가 폼에 채워진 내용을 확인하지 않고 다시 공유한 경우 등) 새 공유로 덮어쓴다 — 마지막 공유만 유효하다.

`src/app/layout.tsx`(또는 별도의 작은 클라이언트 컴포넌트)에서 페이지 로드 시 `navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })`로 등록한다(`updateViaCache: 'none'`은 서비스 워커 스크립트 자체가 HTTP 캐시에서 서빙되어 업데이트가 지연되는 것을 막는다). 등록 실패(구형 브라우저, 프라이빗 모드 등)는 조용히 무시한다 — 서비스 워커가 없어도 앱의 핵심 기능(수동 입력/업로드)은 전혀 영향받지 않는다.

`public/sw.js`는 정적 파일로 `/sw.js`에서 서빙되며 기본 `Cache-Control`이 약하므로(Next의 `public/` 기본값은 `max-age=0`), 서비스 워커 업데이트가 확실히 전파되도록 `next.config.ts`의 `headers()`로 `/sw.js`에 `Cache-Control: no-cache, no-store, must-revalidate`와 `Content-Type: application/javascript; charset=utf-8`를 지정한다.

## 6. 홈페이지에서 공유된 내용 받기

`page.tsx`가 마운트 시(`useEffect`) URL의 `?shared=1` 쿼리 파라미터를 확인한다. 있다면:

1. 먼저 Cache Storage(`caches.open('shared-content')`)에서 메타(`/shared-meta`)와 이미지 Blob들을 읽는다. 정상 경로에서는 서비스 워커가 여기에 저장해 둔다.
2. Cache Storage에 없으면(설치 직후 폴백 경로) 쿠키(§7)를 읽는다.
3. 텍스트라면 문자(SMS) 탭을 활성화하고 본문 textarea에 채운다. 발신번호는 공유로 알 수 없으므로 비운 채로 둔다 — 스키마가 완화되어(§4a) 발신번호 없이 그대로 분석할 수 있다.
4. 이미지라면 각 Blob을 `File`로 되돌려(`new File([blob], ...)`) 기존 `downscaleImage(file)` 파이프라인을 그대로 거친 뒤, 결과 data URL들을 스크린샷 탭에 채운다 — 공유된 이미지도 업로드된 이미지와 동일하게 처리한다.
5. 읽은 캐시 항목/쿠키는 즉시 삭제하고(`cache.delete(...)` / 쿠키 `Max-Age=0`), `history.replaceState`로 URL에서 `?shared=1`을 제거한다 — 새로고침 시 같은 내용이 다시 채워지지 않도록 한다.
6. 공유받은 내용이 없거나(캐시 미스) 파싱/디코딩에 실패하면 조용히 무시하고 빈 폼을 그대로 보여준다 — 에러를 표시하지 않는다.

폼(`AnalyzeForm`)은 새 선택적 prop `initialShared`를 받아, 값이 처음 들어오는 순간에만 해당 탭과 내용을 미리 채운다.

## 7. 서버 폴백 라우트 (드문 예외 경로)

설치 직후, 서비스 워커가 아직 활성화되기 전에 공유가 시도되면 `POST /share-target`이 실제로 네트워크에 도달할 수 있다. 이 경우를 위한 `src/app/share-target/route.ts`:

- `multipart/form-data` 본문을 한 번 파싱한다. 텍스트는 §5와 동일하게 `text → url → title` 순으로 찾는다.
- 파싱한 내용을 **어디에도 저장하지 않고**, 곧바로 절대 URL(`new URL('/?shared=1', req.url)`)로 리다이렉트하되 내용 자체는 URL이 아닌 방식으로 클라이언트에 전달한다 — URL 쿼리 파라미터에 메시지 본문이나 이미지를 실어 보내면 브라우저 히스토리/서버 로그에 노출될 위험이 있으므로 금지. 대신 리다이렉트 응답에 `Set-Cookie`(짧은 만료, 예: 60초)로 내용을 실어 보내고, 홈페이지가 로드 시 해당 쿠키를 읽어 폼에 채운 뒤 즉시 쿠키를 삭제한다. 쿠키 값은 `encodeURIComponent(JSON.stringify(payload))`로 인코딩한다 — 쿠키 값은 세미콜론·쉼표·공백·非ASCII를 그대로 담을 수 없고 한국어 텍스트는 이 문자들을 포함하므로 인코딩 없이는 쿠키가 깨진다.
- **쿠키 크기 검사는 최종 인코딩된 값 길이를 기준으로 한다.** 데이터 URL 원문 길이가 아니라 `encodeURIComponent(JSON.stringify(payload))`의 길이가 상한(브라우저의 항목당 ~4KB 한도를 감안해 여유 있게 ~3800자)을 넘는지 검사한다(base64의 `+`/`/`/`=`와 JSON 구조 문자가 인코딩되며 길이가 늘어나므로, 원문 길이만 검사하면 실제 쿠키가 한도를 넘을 수 있다).
- 폴백 경로의 이미지는 **첫 한 장만**(`files[0]`) 쿠키로 처리하며, 그마저도 상한을 넘으면 이미지는 싣지 않는다. 이미지를 싣지 못한 경우 스크린샷 탭은 비운 채로 두고 별도의 실패 안내는 하지 않는다(§9) — 서비스 워커가 한 번 활성화되면 이후 공유부터는 이 폴백을 아예 타지 않으므로, 실제로는 설치 후 첫 공유 한 번에만 해당하는 드문 경우다.
- **프라이버시 주의**: 이 폴백은 정의상 공유 본문이 이미 서버(POST 본문)에 도달한 경로다. 쿠키는 리다이렉트 직후 `/?shared=1` GET 요청에 한 번 다시 서버로 실려오며(브라우저가 다음 요청에 쿠키를 붙임), 클라이언트가 읽고 즉시 삭제한다. 짧은 만료(60초)와 즉시 삭제로 노출 창을 최소화한다. 라우트는 이 내용을 로깅하지 않는다(`AGENTS.md`의 "메시지 내용 로깅 금지" 준수).

## 8. 홈페이지 안내 및 설치 UI

기존 `PrivacyNotice` 근처(홈페이지 상단)에 두 가지를 추가한다.

**(1) 설치 버튼 (`beforeinstallprompt`)**: 별도의 클라이언트 컴포넌트가 `beforeinstallprompt` 이벤트를 가로채(기본 미니 배너 억제) 저장해 두고, 설치 가능한 상태일 때만 "홈 화면에 추가" 버튼(기존 `Button` 컴포넌트)을 노출한다. 클릭 시 저장해 둔 이벤트의 `prompt()`를 호출하고 `userChoice`를 기다린 뒤 이벤트를 비운다. `appinstalled` 이벤트나 `display-mode: standalone` 매칭으로 이미 설치된 경우에는 버튼을 숨긴다. iOS Safari는 `beforeinstallprompt`를 발생시키지 않으므로 iOS에서는 이 버튼이 아예 나타나지 않는다 — iOS 사용자에게는 아래 안내 텍스트가 대신 노출된다.

**(2) 안내 컴포넌트 (`InstallGuide`)**: 기본 상태는 한 줄 요약 — "안드로이드에서 홈 화면에 추가하면 카카오톡/갤러리에서 바로 공유할 수 있어요. (iOS는 지원되지 않습니다)" + "자세히 보기" 토글. 펼친 상태에서는 다음을 순서대로 안내한다:
- 설치 방법(위 설치 버튼을 누르거나, 크롬 메뉴 → "홈 화면에 추가")
- 사용 방법(카카오톡 메시지 길게 누르기 → 공유 → 안심스캔 선택 / 갤러리에서 스크린샷 공유 → 안심스캔 선택)
- **무료 사용량 한도 안내** — 무료로 운영되는 서비스라 하루 사용량에 제한이 있고, 한도에 도달하면 "오늘의 무료 사용량을 모두 사용했습니다. 내일 다시 시도해주세요"라는 메시지가 나타날 수 있음을 알린다. (구체적 숫자는 명시하지 않는다 — 실제 무료 티어 한도와 코드 상수가 아직 정합되지 않았으므로 정성적으로만 안내한다.)

새 shadcn 컴포넌트나 의존성을 추가하지 않는다 — 펼침/접힘은 기존 컴포넌트들과 동일하게 순수 `useState` + 조건부 렌더링으로, 설치 버튼은 기존 `Button`으로 구현한다. 이 UI들의 시각적 완성도는 §11의 후속 frontend-design 개편에서 서비스 전체와 함께 다듬는다.

## 9. 에러 처리

- 서비스 워커 등록 실패: 조용히 무시한다.
- 공유 파싱 실패(예상치 못한 필드 구성, Blob 디코딩 실패 등): 홈페이지는 빈 폼을 정상적으로 보여준다 — 사용자에게 실패를 알리지 않는다(어차피 수동으로 다시 시도하면 되고, 실패를 알리는 것 자체가 새로운 실패 모드를 만들 위험이 있다).
- 공유된 이미지 수가 `MAX_IMAGES`(5)를 초과하는 경우: 처음 5장만 사용하고 나머지는 조용히 버린다 — 기존 `ImageUploader`가 업로드 중 슬롯 초과 시 보이는 것과 동일한 동작.
- 설치 프롬프트를 지원하지 않는 환경(`beforeinstallprompt` 미발생): 설치 버튼을 렌더링하지 않고 안내 텍스트만 보여준다.

## 10. 테스트 계획

- **`senderNumber` 스키마 완화(§4a)**: Vitest로 커버한다 — `types.test.ts`에 발신번호가 빈 SMS 입력이 이제 통과함을 확인하는 테스트를 추가하고, `systemPrompt.test.ts`에 `buildUserContent`가 빈 발신번호를 `(알 수 없음)`으로 렌더링함을 확인하는 테스트를 추가한다. 기존 테스트는 모두 발신번호를 채워 넣으므로 깨지지 않는다.
- **`src/app/share-target/route.ts`(서버 폴백)**: 기존 `route.test.ts`와 동일한 패턴으로 Vitest 테스트를 작성한다 — 텍스트가 쿠키에 실려 303으로 리다이렉트되는지, 작은 이미지가 data URL 쿠키로 실리는지, 텍스트+이미지 동시 공유 시 이미지가 우선되는지, 이미지가 최종 인코딩 크기 상한을 넘으면 쿠키 없이 리다이렉트되는지, 본문 파싱 실패 시에도 303으로 리다이렉트되는지. `req.formData()`로 multipart 본문을 파싱하는 경로는 기존 테스트(JSON 본문)와 다르므로, 테스트 하네스가 FormData 파싱을 지원하는지 먼저 확인한다.
- **`manifest.json`**: 정적 파일이라 별도 자동 테스트 없음. 빌드 후 Chrome DevTools Application 탭의 "Installability"를 수동 확인한다.
- **`public/sw.js`, `page.tsx` 공유 수신 로직, 설치 버튼**: 브라우저 전용 코드라 이 프로젝트의 기존 관례(`imageDownscale.ts`/`ImageUploader.tsx`)를 따라 Vitest 테스트를 작성하지 않고 수동 검증한다.
- **수동 검증 시나리오**: 실제 안드로이드 기기(또는 Chrome 원격 디버깅)에서 (1) 설치 버튼으로 홈 화면에 설치, (2) 카카오톡 메시지 공유 → 안심스캔 선택 → 문자 탭에 텍스트가 채워지고 발신번호 없이 분석 완료, (3) 갤러리 스크린샷 공유 → 안심스캔 선택 → 스크린샷 탭에 이미지가 (다운스케일되어) 채워지고 분석 완료, (4) 두 경우 모두 Turnstile 인증과 분석하기가 정상 동작, (5) 이미 설치된 상태에서는 설치 버튼이 숨겨지는지, iOS에서는 설치 버튼이 나타나지 않고 안내 텍스트만 보이는지.

## 11. 이후 로드맵 (Out of scope, 추후 고려)

- **서비스 전체 frontend-design 개편(사용자 요청, 후속 트랙)**: 이 PWA 기능이 배포된 뒤, `frontend-design` 스킬로 서비스 전체(홈페이지, 폼, 결과 카드, 이미지 업로더, 안내/설치 UI 등)를 대상으로 별도의 설계 사이클을 진행해 필요 시 현대적 디자인으로 개편한다. 이 개편이 이 기능이 추가한 설치 버튼·안내 컴포넌트의 시각적 완성도까지 함께 끌어올린다. 전체 UI를 건드리는 큰 작업이라 이 스펙과 분리해 별도 spec → plan → 구현 사이클로 다룬다.
- iOS Shortcuts 앱을 통한 유사 기능 제공
- 오프라인 지원(앱 셸 프리캐싱)
- 알림(공유 처리 완료, 분석 결과 알림 등)
