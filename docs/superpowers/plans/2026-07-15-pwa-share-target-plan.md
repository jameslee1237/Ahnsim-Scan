# 안심스캔 — PWA 설치 + 안드로이드 공유 대상 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 안심스캔 installable as a PWA on Android (with an in-app install button) and register it as a system share target, so a user can share a KakaoTalk/SMS message or a gallery screenshot directly to the app — with shared text analyzable without a sender number, and an inline guide explaining install/usage/limits (and that iOS isn't supported).

**Architecture:** A `manifest.json` + icons + a thin `public/sw.js` service worker make the app installable and let it intercept the `POST /share-target` request, storing shared text as JSON and images as raw `Blob`s in the browser's Cache Storage (never touching the server), then redirecting to `/?shared=1`. The home page reads it back on load, runs shared images through the existing `downscaleImage()` pipeline, and seeds `AnalyzeForm` via a new `initialShared` prop. A server-side fallback route handles the rare pre-service-worker-activation window via a short-lived cookie. `SmsInputSchema.senderNumber` is relaxed so shared (sender-less) text analyzes on click. An `InstallButton` uses `beforeinstallprompt` for a real in-app install control.

**Tech Stack:** Same as existing (Next.js 16.2.10, TypeScript, Tailwind v4, Zod, Vitest) — no new dependencies. Icons generated locally via `qlmanage` + `sips` (macOS built-ins) as static assets in `public/icons/`.

**Reference spec:** `docs/superpowers/specs/2026-07-15-pwa-share-target-design.md`

**Branch:** Cut from `develop` per `AGENTS.md`.

**Out of scope (follow-on):** A service-wide `frontend-design` visual overhaul is a separate design cycle after this ships (spec §11). This plan styles the new UI with existing components only.

---

## Task 1: Relax `senderNumber` so shared text analyzes without it

**Files:**
- Modify: `src/lib/analysis/types.ts`
- Modify: `src/lib/analysis/systemPrompt.ts`
- Test: `src/lib/analysis/types.test.ts`, `src/lib/analysis/systemPrompt.test.ts`

Shared KakaoTalk/SMS text carries no sender number. The SMS schema currently requires one (`z.string().min(1)`), so the share flow would dead-end at a 400. This task removes that requirement. Independent of all other tasks; do it first.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/analysis/types.test.ts` inside the `describe('AnalysisInputSchema', ...)` block:

```ts
  it('accepts sms input with an empty senderNumber (shared text has no sender)', () => {
    const result = AnalysisInputSchema.safeParse({
      type: 'sms',
      senderNumber: '',
      messageBody: '엄마 나 폰 액정 깨져서 이 번호로 문자해',
    });
    expect(result.success).toBe(true);
  });
```

Add to `src/lib/analysis/systemPrompt.test.ts` inside the `describe('buildUserContent', ...)` block:

```ts
  it('renders "(알 수 없음)" when the sms senderNumber is empty', () => {
    const content = buildUserContent({
      type: 'sms',
      senderNumber: '',
      messageBody: '엄마 나 폰 액정 깨져서 이 번호로 문자해',
    });
    expect(content).toContain('발신번호: (알 수 없음)');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/analysis/types.test.ts src/lib/analysis/systemPrompt.test.ts`
Expected: the two new tests FAIL — the schema rejects empty `senderNumber`, and `buildUserContent` renders `발신번호: ` (empty), not `(알 수 없음)`.

- [ ] **Step 3: Relax the schema in `src/lib/analysis/types.ts`**

Replace:

```ts
export const SmsInputSchema = z.object({
  type: z.literal('sms'),
  senderNumber: z.string().min(1).max(50),
  messageBody: z.string().min(5).max(MAX_INPUT_LENGTH),
});
```

with:

```ts
export const SmsInputSchema = z.object({
  type: z.literal('sms'),
  // 발신번호는 선택값이다 — 공유(카카오톡/문자)로 받은 텍스트에는 본문만
  // 있고 발신번호가 없으므로 빈 문자열을 허용한다. 발신번호 스푸핑은 여러
  // 신호 중 하나일 뿐이고, 시스템 프롬프트는 본문만으로도 판정하도록
  // 설계되어 있다(예: 가족 사칭은 발신 정보가 없어도 강한 위험 신호).
  senderNumber: z.string().max(50),
  messageBody: z.string().min(5).max(MAX_INPUT_LENGTH),
});
```

- [ ] **Step 4: Handle empty sender in `src/lib/analysis/systemPrompt.ts`**

In `buildUserContent`, replace the sms branch's sender line:

```ts
      `발신번호: ${input.senderNumber}`,
```

with:

```ts
      `발신번호: ${input.senderNumber || '(알 수 없음)'}`,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/analysis/types.test.ts src/lib/analysis/systemPrompt.test.ts`
Expected: PASS (including the two new tests).

- [ ] **Step 6: Run the full suite, tsc, and lint**

Run: `pnpm test && npx tsc --noEmit && pnpm lint`
Expected: full suite green, zero type errors, lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/analysis/types.ts src/lib/analysis/systemPrompt.ts src/lib/analysis/types.test.ts src/lib/analysis/systemPrompt.test.ts
git commit -m "feat: allow empty sms senderNumber so shared text analyzes without it"
```

---

## Task 2: App icons + manifest + layout wiring

**Files:**
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-192.png`, `public/icons/icon-maskable-512.png`
- Create: `public/manifest.json`
- Modify: `src/app/layout.tsx`

No automated test — static assets, verified manually in Task 8 via Chrome DevTools.

- [ ] **Step 1: Author the icon source HTML**

Create a temporary file (NOT committed; deleted in Step 2) at `$CLAUDE_JOB_DIR/tmp/icon-src/icon.html`:

```html
<!DOCTYPE html>
<html>
<head><style>
  html, body { margin: 0; padding: 0; }
  .icon { width: 512px; height: 512px; background: #1a56db; display: flex; align-items: center; justify-content: center; }
  svg { width: 60%; height: 60%; }
</style></head>
<body>
  <div class="icon">
    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  </div>
</body>
</html>
```

And `$CLAUDE_JOB_DIR/tmp/icon-src/icon-maskable.html` — identical except `svg { width: 45%; height: 45%; }` (smaller, so Android's adaptive-icon mask, which crops to the inner ~80% circle, doesn't clip the shield).

- [ ] **Step 2: Rasterize with `qlmanage`, resize with `sips`**

`sips` cannot rasterize SVG/HTML directly, so `qlmanage` (QuickLook) produces the PNG first, then `sips` resizes.

```bash
mkdir -p public/icons
SRC="$CLAUDE_JOB_DIR/tmp/icon-src"
qlmanage -t -s 1024 -o "$SRC" "$SRC/icon.html"
qlmanage -t -s 1024 -o "$SRC" "$SRC/icon-maskable.html"

sips -z 512 512 "$SRC/icon.html.png"          --out public/icons/icon-512.png
sips -z 192 192 "$SRC/icon.html.png"          --out public/icons/icon-192.png
sips -z 512 512 "$SRC/icon-maskable.html.png" --out public/icons/icon-maskable-512.png
sips -z 192 192 "$SRC/icon-maskable.html.png" --out public/icons/icon-maskable-192.png

rm -rf "$SRC"
```

- [ ] **Step 3: Verify the icons visually**

Run: `file public/icons/*.png` and open them (e.g. `open public/icons/icon-512.png`).
Expected: each is a PNG at exactly its named size, background is opaque `#1a56db`, and the white shield is centered (the maskable variants have more padding). `qlmanage`'s HTML rendering varies across macOS versions — if any icon is the wrong size, transparent, or off-center, regenerate via another method (e.g. Chrome headless `--screenshot`). These are one-time committed assets, not CI-generated, so any method that yields correct PNGs is acceptable.

- [ ] **Step 4: Create `public/manifest.json`**

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

- [ ] **Step 5: Link the manifest + theme-color from `src/app/layout.tsx`**

In `src/app/layout.tsx`, change the type-only import:

```ts
import type { Metadata } from 'next';
```

to:

```ts
import type { Metadata, Viewport } from 'next';
```

Add `manifest` to the existing `metadata` export and add a new `viewport` export directly below it (Next 16: a `public/manifest.json` needs the explicit `metadata.manifest` link, and `themeColor` must live in `viewport`, not `metadata`):

```ts
export const metadata: Metadata = {
  title: '스미싱/피싱 확인 서비스',
  description: '문자와 이메일이 사기인지 AI로 확인하세요.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#1a56db',
};
```

- [ ] **Step 6: Verify the build emits the tags**

Run: `pnpm build`
Expected: succeeds. Then `pnpm dev`, open `http://localhost:3000`, and confirm in DevTools' Elements → `<head>` that both `<link rel="manifest" href="/manifest.json">` and `<meta name="theme-color" content="#1a56db">` are present, and that `/manifest.json` loads (Application → Manifest, no errors).

- [ ] **Step 7: Commit**

```bash
git add public/icons public/manifest.json src/app/layout.tsx
git commit -m "feat: add PWA manifest, icons, and theme-color"
```

---

## Task 3: Service worker + registration + cache headers

**Files:**
- Create: `public/sw.js`
- Create: `src/components/ServiceWorkerRegistration.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `next.config.ts`

No automated test — service workers can't run in Vitest's Node environment (same convention as `imageDownscale.ts`). Verified manually in Task 8.

- [ ] **Step 1: Create `public/sw.js`**

```js
// 이 서비스 워커는 두 가지만 한다: (1) PWA 설치 요건 충족(fetch 이벤트
// 핸들러 존재), (2) POST /share-target 요청을 가로채 공유된 텍스트/이미지를
// Cache Storage에 저장한 뒤 홈페이지로 리다이렉트한다. 그 외 모든 요청은
// 그대로 네트워크로 통과시킨다 — 오프라인 캐싱/프리캐싱은 하지 않는다.

const SHARE_CACHE_NAME = 'shared-content';
const META_KEY = '/shared-meta';
const MAX_SHARED_IMAGES = 5;
const imageKey = (i) => `/shared-image-${i}`;

// 일부 공유 앱은 텍스트를 text가 아니라 url/title에 담는다 — 순서대로 찾는다.
const pickText = (formData) => {
  for (const field of ['text', 'url', 'title']) {
    const value = formData.get(field);
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
};

const handleShareTarget = async (event) => {
  const cache = await caches.open(SHARE_CACHE_NAME);

  // 이전 공유 잔여물을 먼저 비운다 — 마지막 공유만 유효하다.
  const staleKeys = await cache.keys();
  await Promise.all(staleKeys.map((key) => cache.delete(key)));

  let meta = null;
  try {
    const formData = await event.request.formData();
    const files = formData
      .getAll('images')
      .filter((entry) => entry instanceof File && entry.size > 0);

    // 캡션이 있는 사진 공유처럼 텍스트와 이미지가 함께 오면 이미지를
    // 우선한다 — 이미지 분석이 전체 내용을 판독하므로.
    if (files.length > 0) {
      const capped = files.slice(0, MAX_SHARED_IMAGES);
      // base64로 변환하지 않고 Blob 그대로 저장한다 — 원본이 수 MB일 수
      // 있어 인코딩 비용/저장 용량이 크다. Response가 MIME 타입을 보존한다.
      await Promise.all(
        capped.map((file, i) =>
          cache.put(
            imageKey(i),
            new Response(file, {
              headers: { 'content-type': file.type || 'application/octet-stream' },
            }),
          ),
        ),
      );
      meta = { type: 'image', count: capped.length };
    } else {
      const text = pickText(formData);
      if (text) meta = { type: 'sms', text };
    }
  } catch {
    meta = null;
  }

  if (meta) {
    await cache.put(
      META_KEY,
      new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }),
    );
  }

  // 상대 URL은 구현에 따라 TypeError를 던진 전례가 있어 절대 URL로 통일한다.
  return Response.redirect(new URL('/?shared=1', self.location.origin).href, 303);
};

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(event));
  }
  // 그 외 요청은 가로채지 않는다 — 기본 네트워크 동작 그대로 둔다.
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
```

- [ ] **Step 2: Create `src/components/ServiceWorkerRegistration.tsx`**

```tsx
'use client';

import { useEffect } from 'react';

// 서비스 워커는 PWA 설치 요건 충족과 공유 대상 요청 가로채기만 담당한다 —
// 오프라인 캐싱은 하지 않는다. 등록 실패(구형 브라우저, 프라이빗 모드 등)는
// 앱의 핵심 기능(수동 입력/업로드)에 영향이 없으므로 조용히 무시한다.
// updateViaCache: 'none'은 sw.js 자체가 HTTP 캐시에서 서빙되어 업데이트가
// 지연되는 것을 막는다.
export const ServiceWorkerRegistration = () => {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
  }, []);

  return null;
};
```

- [ ] **Step 3: Render it from `src/app/layout.tsx`**

Add the import:

```tsx
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
```

and render it as the first child of `<body>`:

```tsx
      <body className="antialiased">
        <ServiceWorkerRegistration />
        {children}
      </body>
```

- [ ] **Step 4: Add cache headers for `/sw.js` in `next.config.ts`**

Add a `headers()` function to the existing `nextConfig` object (keep the existing `turbopack` key):

```ts
const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // 서비스 워커 스크립트는 항상 최신본을 받아 업데이트가 즉시 전파되도록
  // 캐시를 끈다. public/의 기본 Cache-Control(max-age=0)만으로는 부족하다.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};
```

- [ ] **Step 5: Verify tsc/lint/build (no runtime SW test possible)**

Run: `npx tsc --noEmit && pnpm lint && pnpm build`
Expected: all clean. `sw.js` is a static file, not compiled/linted by the TS/ESLint pipeline — expected.

- [ ] **Step 6: Commit**

```bash
git add public/sw.js src/components/ServiceWorkerRegistration.tsx src/app/layout.tsx next.config.ts
git commit -m "feat: add service worker for installability and share-target interception"
```

---

## Task 4: `AnalyzeForm` — accept shared content

**Files:**
- Modify: `src/components/AnalyzeForm.tsx`

No test file (matches this component's existing convention). Compiles standalone — the new prop is optional and unused until Task 6.

- [ ] **Step 1: Add `useEffect` to the React import**

Replace:

```tsx
import { useRef, useState } from 'react';
```

with:

```tsx
import { useEffect, useRef, useState } from 'react';
```

- [ ] **Step 2: Export a `SharedContent` type and extend the props**

Replace:

```tsx
interface IAnalyzeFormProps {
  onResult: (result: AnalysisResult, displayText: string) => void;
}
```

with:

```tsx
// page.tsx가 이 타입을 import해 재사용한다 — 한 곳에서만 정의한다.
export type SharedContent =
  | { type: 'sms'; messageBody: string }
  | { type: 'image'; images: string[] };

interface IAnalyzeFormProps {
  onResult: (result: AnalysisResult, displayText: string) => void;
  initialShared?: SharedContent;
}
```

- [ ] **Step 3: Accept the prop and seed state from it**

Replace:

```tsx
export const AnalyzeForm = ({ onResult }: IAnalyzeFormProps) => {
```

with:

```tsx
export const AnalyzeForm = ({ onResult, initialShared }: IAnalyzeFormProps) => {
```

Immediately after the `const [images, setImages] = useState<string[]>([]);` line, add:

```tsx

  // 홈페이지가 공유받은 내용을 읽어오면 initialShared가 undefined에서 값으로
  // 한 번 바뀐다 — 그 순간에만 해당 탭과 내용을 미리 채운다. 부모는 이 값을
  // 상태로 한 번만 세팅하므로 참조가 안정적이라 [initialShared] 의존으로 충분
  // 하다. (공유 텍스트는 발신번호 없이도 분석 가능하도록 스키마가 완화됨.)
  useEffect(() => {
    if (!initialShared) return;
    if (initialShared.type === 'sms') {
      setMessageType('sms');
      setText(initialShared.messageBody);
    } else {
      setMessageType('image');
      setImages(initialShared.images);
    }
  }, [initialShared]);
```

- [ ] **Step 4: Run tsc/lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/AnalyzeForm.tsx
git commit -m "feat: let AnalyzeForm seed its state from shared content"
```

---

## Task 5: `InstallButton` + `InstallGuide`

**Files:**
- Create: `src/components/InstallButton.tsx`
- Create: `src/components/InstallGuide.tsx`

No test files (browser-only / presentational — project convention). Both compile standalone; consumed by `page.tsx` in Task 6.

- [ ] **Step 1: Create `src/components/InstallButton.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

// beforeinstallprompt는 표준 DOM 타입에 없어 직접 좁힌다.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// 브라우저가 PWA 설치 가능 조건을 만족하면 beforeinstallprompt가 발생한다.
// 그 이벤트를 잡아 두었다가 앱 내 "홈 화면에 추가" 버튼으로 노출한다. iOS
// Safari는 이 이벤트를 발생시키지 않으므로 iOS에서는 버튼이 나타나지 않는다.
export const InstallButton = () => {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // 이미 설치되어 standalone으로 실행 중이면 버튼을 띄우지 않는다.
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault(); // 크롬 기본 미니 배너 억제
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setPromptEvent(null);

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!promptEvent) return null;

  const handleInstall = async () => {
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null); // 프롬프트 이벤트는 한 번만 사용할 수 있다.
  };

  return (
    <Button type="button" variant="outline" onClick={handleInstall} className="mb-3 w-full">
      <Download className="size-4" aria-hidden="true" />
      홈 화면에 추가
    </Button>
  );
};
```

- [ ] **Step 2: Create `src/components/InstallGuide.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { ChevronDown, Smartphone } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InstallButton } from '@/components/InstallButton';

// 새 shadcn 컴포넌트나 의존성을 추가하지 않는다 — 펼침/접힘은 순수 useState +
// 조건부 렌더링으로 구현한다. 시각적 완성도는 이후 서비스 전체 frontend-design
// 개편에서 함께 다듬는다.
export const InstallGuide = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Alert role="note" className="mb-5 border-none bg-muted/60">
      <Smartphone className="size-4 text-muted-foreground" aria-hidden="true" />
      <AlertDescription>
        <InstallButton />
        <div className="flex items-center justify-between gap-2">
          <span>
            안드로이드에서 홈 화면에 추가하면 카카오톡·갤러리에서 바로 공유할 수 있어요.
            (iOS는 지원되지 않습니다)
          </span>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary"
          >
            자세히 보기
            <ChevronDown
              className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
        {expanded && (
          <div className="mt-3 space-y-3 text-sm">
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>위 &quot;홈 화면에 추가&quot; 버튼(또는 크롬 메뉴 ⋮ → &quot;홈 화면에 추가&quot;)으로 설치하세요.</li>
              <li>카카오톡·문자 메시지를 길게 눌러 공유를 선택하고, 목록에서 안심스캔을 고르세요.</li>
              <li>갤러리에서 스크린샷을 공유할 때도 안심스캔을 선택할 수 있어요.</li>
              <li>공유한 내용은 이 화면에 자동으로 채워지며, 인증 후 분석하기를 누르면 됩니다.</li>
            </ol>
            <p className="text-muted-foreground">
              무료로 운영되는 서비스라 하루 사용량에 제한이 있어요. 한도에 도달하면 &quot;오늘의 무료
              사용량을 모두 사용했습니다&quot;라는 안내가 나타날 수 있으며, 다음 날 다시 이용할 수
              있습니다.
            </p>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
};
```

- [ ] **Step 3: Run tsc/lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/InstallButton.tsx src/components/InstallGuide.tsx
git commit -m "feat: add in-app install button and install/usage/limits guide"
```

---

## Task 6: `page.tsx` — consume shared content on load

**Files:**
- Modify: `src/lib/imageDownscale.ts`
- Modify: `src/app/page.tsx`

Depends on Task 4 (`initialShared`) and Task 5 (`InstallGuide`). After this task the tree is fully wired and builds clean. No test files (existing convention for both).

- [ ] **Step 1: Add `dataUrlToFile` to `src/lib/imageDownscale.ts`**

The cookie-fallback path (Task 7) delivers a shared image as a data URL, but `downscaleImage` takes a `File`. Add this exported helper (leave `downscaleImage` and its private helpers unchanged):

```ts
// data URL(서버 폴백 쿠키가 실어 보낸 이미지)을 File로 되돌린다 —
// downscaleImage가 File을 받으므로, 공유받은 이미지도 업로드 이미지와 동일한
// 다운스케일 경로를 타게 하려면 먼저 File로 되돌려야 한다. (정상 경로의
// 이미지는 서비스 워커가 Blob으로 저장하므로 page.tsx가 직접 File로 만든다.)
export const dataUrlToFile = (dataUrl: string, filename: string): File => {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mimeType });
};
```

- [ ] **Step 2: Replace the entire contents of `src/app/page.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { PrivacyNotice } from '@/components/PrivacyNotice';
import { InstallGuide } from '@/components/InstallGuide';
import { AnalyzeForm, type SharedContent } from '@/components/AnalyzeForm';
import { ResultCard } from '@/components/ResultCard';
import { dataUrlToFile, downscaleImage } from '@/lib/imageDownscale';
import type { AnalysisResult } from '@/lib/analysis/types';

// 공유 경로가 정규화한 중간 형태 — 이미지는 (Cache의 Blob이든 쿠키의 data
// URL이든) 항상 File[]로 통일해 기존 downscaleImage 파이프라인에 넘긴다.
type NormalizedShare = { type: 'sms'; text: string } | { type: 'image'; files: File[] };

const SHARE_CACHE_NAME = 'shared-content';
const SHARE_COOKIE_NAME = 'shared_content';
const MAX_SHARED_IMAGES = 5;

// 정상 경로: 서비스 워커가 Cache Storage에 남긴 메타/Blob을 읽는다.
const readSharedFromCache = async (): Promise<NormalizedShare | null> => {
  try {
    const cache = await caches.open(SHARE_CACHE_NAME);
    const metaResponse = await cache.match('/shared-meta');
    if (!metaResponse) return null;

    const meta = (await metaResponse.json()) as { type?: string; text?: string; count?: number };
    let result: NormalizedShare | null = null;

    if (meta.type === 'sms' && typeof meta.text === 'string') {
      result = { type: 'sms', text: meta.text };
    } else if (meta.type === 'image' && typeof meta.count === 'number') {
      const files: File[] = [];
      for (let i = 0; i < Math.min(meta.count, MAX_SHARED_IMAGES); i++) {
        const imageResponse = await cache.match(`/shared-image-${i}`);
        if (!imageResponse) continue;
        const blob = await imageResponse.blob();
        files.push(new File([blob], `shared-${i}`, { type: blob.type || 'image/jpeg' }));
      }
      if (files.length > 0) result = { type: 'image', files };
    }

    // 읽은 즉시 캐시를 비운다 — 새로고침 시 재사용되지 않도록.
    const keys = await cache.keys();
    await Promise.all(keys.map((key) => cache.delete(key)));
    return result;
  } catch {
    return null;
  }
};

// 폴백 경로: 서버가 실어 보낸 쿠키를 읽고 즉시 삭제한다.
const readSharedFromCookie = (): NormalizedShare | null => {
  const match = document.cookie.match(/(?:^|; )shared_content=([^;]*)/);
  if (!match) return null;
  document.cookie = `${SHARE_COOKIE_NAME}=; Max-Age=0; path=/`;
  try {
    const payload = JSON.parse(decodeURIComponent(match[1])) as {
      type?: string;
      text?: string;
      images?: string[];
    };
    if (payload.type === 'sms' && typeof payload.text === 'string') {
      return { type: 'sms', text: payload.text };
    }
    if (payload.type === 'image' && Array.isArray(payload.images)) {
      const files = payload.images
        .slice(0, MAX_SHARED_IMAGES)
        .map((dataUrl, i) => dataUrlToFile(dataUrl, `shared-${i}`));
      if (files.length > 0) return { type: 'image', files };
    }
    return null;
  } catch {
    return null;
  }
};

const HomePage = () => {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [displayText, setDisplayText] = useState('');
  const [sharedContent, setSharedContent] = useState<SharedContent | undefined>(undefined);
  const resultRef = useRef<HTMLDivElement>(null);

  // 결과 카드는 폼 아래에 새로 나타나는데, 폼이 길면 화면 밖으로 벗어날 수
  // 있다. 결과가 생기면 그쪽으로 스크롤하고, aria-live로 스크린 리더에도
  // 알린다.
  useEffect(() => {
    if (result) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      resultRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  }, [result]);

  // ?shared=1로 도착했으면 공유된 내용을 한 번 읽어 폼에 채운다. 정상 경로는
  // Cache Storage, 설치 직후 폴백 경로는 쿠키. 공유 이미지는 다운스케일이
  // 적용되지 않은 원본일 수 있어 downscaleImage를 거쳐 업로드 흐름과 동일하게
  // 처리한다. 실패는 조용히 무시하고 빈 폼을 보여준다.
  useEffect(() => {
    const consumeSharedContent = async () => {
      const url = new URL(window.location.href);
      if (url.searchParams.get('shared') !== '1') return;

      const shared = (await readSharedFromCache()) ?? readSharedFromCookie();
      if (shared) {
        if (shared.type === 'sms') {
          setSharedContent({ type: 'sms', messageBody: shared.text });
        } else {
          const images = await Promise.all(shared.files.map((file) => downscaleImage(file)));
          setSharedContent({ type: 'image', images });
        }
      }

      url.searchParams.delete('shared');
      window.history.replaceState({}, '', url.toString());
    };

    void consumeSharedContent();
  }, []);

  const handleResult = (newResult: AnalysisResult, newDisplayText: string) => {
    setResult(newResult);
    setDisplayText(newDisplayText);
  };

  const handleClear = () => {
    setResult(null);
    setDisplayText('');
  };

  return (
    <main className="relative mx-auto flex min-h-screen max-w-xl flex-col px-4 py-8 sm:px-6 sm:py-12 lg:max-w-2xl lg:py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-primary/10 to-transparent"
      />
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-3 flex size-16 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="size-8 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          스미싱/피싱 문자·이메일·스크린샷 확인
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          문자, 이메일, 또는 스크린샷을 올리면 AI가 사기 여부를 분석해드려요.
        </p>
      </div>
      <InstallGuide />
      <PrivacyNotice />
      <AnalyzeForm onResult={handleResult} initialShared={sharedContent} />
      {result && (
        <div ref={resultRef} role="status" aria-live="polite">
          <ResultCard result={result} originalText={displayText} onClear={handleClear} />
        </div>
      )}
    </main>
  );
};

export default HomePage;
```

- [ ] **Step 3: Run tsc/lint/build**

Run: `npx tsc --noEmit && pnpm lint && pnpm build`
Expected: all clean (the `InstallGuide` and `SharedContent` imports resolve — Tasks 4 and 5 landed them).

- [ ] **Step 4: Commit**

```bash
git add src/lib/imageDownscale.ts src/app/page.tsx
git commit -m "feat: consume shared content on load and seed the form"
```

---

## Task 7: Server fallback route for `/share-target`

**Files:**
- Create: `src/app/share-target/route.ts`
- Test: `src/app/share-target/route.test.ts`

Only reached in the rare window right after install, before the service worker activates (spec §7). Server code, so it gets full TDD coverage. Independent of Tasks 2–6.

- [ ] **Step 1: Write the failing tests**

Create `src/app/share-target/route.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const makeShareRequest = (formData: FormData) =>
  new NextRequest('http://localhost/share-target', { method: 'POST', body: formData });

// 라우트는 명시적으로 encodeURIComponent(JSON.stringify(payload))를 쿠키 값으로
// 쓰고 Set-Cookie 헤더에 직접 넣으므로, 테스트도 그 헤더를 직접 파싱해
// 인코딩 계층을 한 번만 되돌린다(NextResponse 쿠키 직렬화 동작에 의존하지 않음).
const readCookiePayload = (res: Response) => {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(/shared_content=([^;]*)/);
  if (!match) return null;
  return JSON.parse(decodeURIComponent(match[1]));
};

describe('POST /share-target', () => {
  it('redirects to /?shared=1 for a text share and sets a cookie with the text', async () => {
    const formData = new FormData();
    formData.set('text', '엄마 나 사고났어 이 계좌로 보내줘');

    const res = await POST(makeShareRequest(formData));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/?shared=1');
    expect(readCookiePayload(res)).toEqual({ type: 'sms', text: '엄마 나 사고났어 이 계좌로 보내줘' });
  });

  it('falls back to the url field when text is absent', async () => {
    const formData = new FormData();
    formData.set('url', 'https://scam.example.com/login');

    const res = await POST(makeShareRequest(formData));
    expect(readCookiePayload(res)).toEqual({ type: 'sms', text: 'https://scam.example.com/login' });
  });

  it('sets a cookie with the image data URL for a small image share', async () => {
    const formData = new FormData();
    formData.set('images', new File([new Uint8Array([1, 2, 3])], 'shot.jpg', { type: 'image/jpeg' }));

    const res = await POST(makeShareRequest(formData));
    const payload = readCookiePayload(res);
    expect(payload.type).toBe('image');
    expect(payload.images[0]).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('prioritizes an image over text when both are shared together', async () => {
    const formData = new FormData();
    formData.set('text', '캡션입니다');
    formData.set('images', new File([new Uint8Array([1, 2, 3])], 'shot.jpg', { type: 'image/jpeg' }));

    const res = await POST(makeShareRequest(formData));
    expect(readCookiePayload(res).type).toBe('image');
  });

  it('redirects without a cookie when the encoded image would exceed the size limit', async () => {
    const formData = new FormData();
    formData.set('images', new File([new Uint8Array(4000)], 'big.jpg', { type: 'image/jpeg' }));

    const res = await POST(makeShareRequest(formData));
    expect(res.status).toBe(303);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('redirects even when the body cannot be parsed as form data', async () => {
    const req = new NextRequest('http://localhost/share-target', {
      method: 'POST',
      body: 'not form data',
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/?shared=1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/share-target/route.test.ts`
Expected: FAIL — `Cannot find module './route'`. (If instead they fail because `req.formData()` throws in the test env, stop and resolve the harness's multipart support before continuing — see spec §10.)

- [ ] **Step 3: Write the implementation**

Create `src/app/share-target/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

const SHARE_COOKIE_NAME = 'shared_content';
const SHARE_COOKIE_MAX_AGE_SECONDS = 60;
// 브라우저의 항목당 쿠키 크기 한도(~4KB)를 감안한 최종(인코딩된) 값 길이 상한.
const MAX_COOKIE_VALUE_LENGTH = 3800;

type SharedPayload = { type: 'sms'; text: string } | { type: 'image'; images: string[] };

// 일부 공유 앱은 텍스트를 text가 아니라 url/title에 담는다 — sw.js와 동일 순서.
const pickText = (formData: FormData): string | null => {
  for (const field of ['text', 'url', 'title']) {
    const value = formData.get(field);
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
};

// 서비스 워커가 아직 활성화되지 않은 설치 직후의 짧은 시간에만 실제로 도달하는
// 경로다 — 정상적으로는 public/sw.js가 이 요청을 가로챈다. 내용은 어디에도
// 저장하지 않고, 쿠키에 실어 즉시 리다이렉트한다(URL에 내용을 싣지 않는다 —
// 브라우저 히스토리/서버 로그 노출 위험). 쿠키 값 인코딩을 명시적으로 제어
// 하려고 Set-Cookie 헤더를 직접 구성한다(encodeURIComponent 1회).
export const POST = async (req: NextRequest) => {
  let payload: SharedPayload | null = null;

  try {
    const formData = await req.formData();
    const files = formData
      .getAll('images')
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    // 이미지 우선 — sw.js의 handleShareTarget과 동일한 우선순위. 폴백은 첫
    // 한 장만 쿠키로 처리한다.
    if (files.length > 0) {
      const file = files[0];
      const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
      payload = { type: 'image', images: [`data:${file.type};base64,${base64}`] };
    } else {
      const text = pickText(formData);
      if (text) payload = { type: 'sms', text };
    }
  } catch {
    // 파싱 실패는 빈 폼으로 이어지도록 조용히 넘어간다.
    payload = null;
  }

  const response = NextResponse.redirect(new URL('/?shared=1', req.url), 303);

  if (payload) {
    const cookieValue = encodeURIComponent(JSON.stringify(payload));
    // 최종 인코딩된 값 길이로 검사한다 — 상한을 넘으면(대개 큰 이미지) 쿠키를
    // 싣지 않고, 클라이언트는 빈 폼을 보여준다.
    if (cookieValue.length <= MAX_COOKIE_VALUE_LENGTH) {
      response.headers.append(
        'Set-Cookie',
        `${SHARE_COOKIE_NAME}=${cookieValue}; Max-Age=${SHARE_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`,
      );
    }
  }

  return response;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/share-target/route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full suite, tsc, lint**

Run: `pnpm test && npx tsc --noEmit && pnpm lint`
Expected: full suite green, zero type errors, lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/share-target/route.ts src/app/share-target/route.test.ts
git commit -m "feat: add server-side share-target fallback for pre-activation window"
```

---

## Task 8: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Installability.** `pnpm build && pnpm start`, open Chrome DevTools → Application → Manifest. Confirm the manifest loads with no errors, all four icons render, and Installability shows no blocking issues.

- [ ] **Step 2: Install via the in-app button.** On an Android device (or Chrome desktop with an installable origin), confirm the "홈 화면에 추가" button appears, installs the app, and opens in standalone mode. Reload — confirm the button is now hidden (already installed).

- [ ] **Step 3: Share text.** Long-press a KakaoTalk/SMS message → Share → confirm 안심스캔 is in the sheet → select it → confirm the app opens with the SMS tab active, the text pre-filled, 발신번호 empty, and that completing Turnstile + 분석하기 returns a result (no 400 despite the empty sender).

- [ ] **Step 4: Share a screenshot.** From Gallery, share an image → select 안심스캔 → confirm the screenshot tab is active and the image is pre-loaded. In DevTools, confirm the resulting data URL is downscaled (a few hundred KB, not the multi-MB original).

- [ ] **Step 5: Existing flow untouched.** From either pre-filled state, complete Turnstile and 분석하기 — confirm identical behavior to manual entry (same result card, same caching).

- [ ] **Step 6: Guide + limits + iOS.** Confirm the `InstallGuide` shows near the top, "자세히 보기" expands/collapses, the usage-limit paragraph is present, and on iOS Safari the install button does NOT appear while the "(iOS는 지원되지 않습니다)" text does.

- [ ] **Step 7: (If feasible) Fallback.** Uninstall/reinstall and immediately share before opening the app, to try to hit the pre-activation cookie path. If it still routes through the service worker, that's fine — the narrow timing window is hard to hit, and Task 7's tests already cover the fallback route's logic directly.
