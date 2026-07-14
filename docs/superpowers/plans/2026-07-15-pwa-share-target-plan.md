# 안심스캔 — PWA 설치 + 안드로이드 공유 대상 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 안심스캔 installable as a PWA on Android and register it as a system share target, so a user can share a KakaoTalk/SMS message or a gallery screenshot directly to the app instead of manually copying/uploading — with an inline guide explaining this (and that iOS isn't supported) on the home page.

**Architecture:** A `manifest.json` + app icons make the app installable and declare `share_target`. A thin Service Worker (`public/sw.js`) intercepts the resulting `POST /share-target` request, stores the shared text/image in the browser's own Cache Storage API (never touching the server), and redirects to `/?shared=1`. The home page reads it back on load, downscales shared images through the existing `downscaleImage()` pipeline (shared images aren't pre-downscaled the way uploads are), and passes it into `AnalyzeForm` via a new `initialShared` prop. A server-side fallback route (`src/app/share-target/route.ts`) handles the rare case where a share arrives before the Service Worker has activated, using a short-lived cookie instead of any storage.

**Tech Stack:** Same as existing (Next.js 16, TypeScript, Tailwind v4) — no new dependencies. Icons generated locally via `qlmanage`/`sips` (both macOS built-ins) as static assets checked into `public/icons/`.

**Reference spec:** `docs/superpowers/specs/2026-07-15-pwa-share-target-design.md`

**Branch:** Cut from `develop` per `AGENTS.md`.

---

## Task 1: App icons + manifest.json

**Files:**
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-192.png`, `public/icons/icon-maskable-512.png`
- Create: `public/manifest.json`

No automated test — these are static assets, verified manually (Task 7) via Chrome DevTools' Installability check.

- [ ] **Step 1: Generate the icon source images**

Create a temporary HTML file (not committed — used only to rasterize the icon, delete it after Step 2) at e.g. `/tmp/icon-source/icon.html`:

```html
<!DOCTYPE html>
<html>
<head><style>
  body { margin: 0; }
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

And a second file at `/tmp/icon-source/icon-maskable.html` — identical except `svg { width: 45%; height: 45%; }` (smaller, to leave safe-zone padding so Android's adaptive-icon mask doesn't clip the shield when it crops to a circle/squircle).

- [ ] **Step 2: Rasterize with `qlmanage`, resize with `sips`**

```bash
mkdir -p public/icons
qlmanage -t -s 512 -o /tmp/icon-source /tmp/icon-source/icon.html
qlmanage -t -s 512 -o /tmp/icon-source /tmp/icon-source/icon-maskable.html

sips -z 512 512 /tmp/icon-source/icon.html.png --out public/icons/icon-512.png
sips -z 192 192 /tmp/icon-source/icon.html.png --out public/icons/icon-192.png
sips -z 512 512 /tmp/icon-source/icon-maskable.html.png --out public/icons/icon-maskable-512.png
sips -z 192 192 /tmp/icon-source/icon-maskable.html.png --out public/icons/icon-maskable-192.png

rm -rf /tmp/icon-source
```

Verify all four PNGs exist and open at the expected sizes: `file public/icons/*.png`.

- [ ] **Step 3: Create `public/manifest.json`**

```json
{
  "name": "안심스캔",
  "short_name": "안심스캔",
  "description": "문자, 이메일, 스크린샷이 사기인지 AI로 확인하세요.",
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

- [ ] **Step 4: Link the manifest from `src/app/layout.tsx`**

Modify the `metadata` export and add a `viewport` export — replace:

```ts
export const metadata: Metadata = {
  title: '스미싱/피싱 확인 서비스',
  description: '문자와 이메일이 사기인지 AI로 확인하세요.',
};
```

with:

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

And add `Viewport` to the type-only import at the top of the file — replace `import type { Metadata } from 'next';` with `import type { Metadata, Viewport } from 'next';`.

- [ ] **Step 5: Verify the build picks this up**

Run: `pnpm build`
Expected: succeeds; then run `pnpm dev`, open `http://localhost:3000`, check the page source or DevTools' Elements tab for `<link rel="manifest" href="/manifest.json">` and `<meta name="theme-color" content="#1a56db">` in `<head>`.

- [ ] **Step 6: Commit**

```bash
git add public/icons public/manifest.json src/app/layout.tsx
git commit -m "feat: add PWA manifest and app icons"
```

---

## Task 2: Service worker + registration

**Files:**
- Create: `public/sw.js`
- Create: `src/components/ServiceWorkerRegistration.tsx`
- Modify: `src/app/layout.tsx`

No automated test — Service Workers can't run in Vitest's Node environment (same reasoning as `imageDownscale.ts`/`ImageUploader.tsx` having no Vitest coverage). Verified manually in Task 7.

- [ ] **Step 1: Create `public/sw.js`**

```js
// 이 서비스 워커는 두 가지만 한다: (1) PWA 설치 요건 충족(fetch 이벤트
// 핸들러 존재), (2) POST /share-target 요청을 가로채 공유된 텍스트/이미지를
// Cache Storage에 저장한 뒤 홈페이지로 리다이렉트한다. 그 외 모든 요청은
// 그대로 네트워크로 통과시킨다 — 오프라인 캐싱/프리캐싱은 하지 않는다.

const SHARE_CACHE_NAME = 'shared-content';
const SHARE_CACHE_KEY = '/shared-payload';

// 서비스 워커 전역 범위에는 FileReader가 없다 — Blob.arrayBuffer()와
// btoa()(둘 다 서비스 워커에서 사용 가능)로 직접 base64 data URL을 만든다.
const fileToDataUrl = async (file) => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:${file.type};base64,${base64}`;
};

const handleShareTarget = async (event) => {
  const formData = await event.request.formData();
  const text = formData.get('text');
  const files = formData.getAll('images').filter((entry) => entry instanceof File && entry.size > 0);

  // 캡션이 있는 사진 공유처럼 텍스트와 이미지가 동시에 오는 경우, 이미지를
  // 우선한다 — 이미지 분석이 어차피 전체 내용을 판독하고, 텍스트만으로는
  // 스크린샷 없이 캡션만 분석하는 것이 무의미하다.
  let payload = null;
  if (files.length > 0) {
    const images = await Promise.all(files.map(fileToDataUrl));
    payload = { type: 'image', images };
  } else if (typeof text === 'string' && text.trim().length > 0) {
    payload = { type: 'sms', text };
  }

  if (payload) {
    const cache = await caches.open(SHARE_CACHE_NAME);
    await cache.put(SHARE_CACHE_KEY, new Response(JSON.stringify(payload)));
  }

  return Response.redirect('/?shared=1', 303);
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

// 서비스 워커는 PWA 설치 요건 충족과 공유 대상(share target) 요청 가로채기,
// 두 가지 역할만 담당한다 — 오프라인 캐싱은 하지 않는다. 등록 자체가
// 실패해도(구형 브라우저, 프라이빗 모드 등) 앱의 핵심 기능(수동 입력/업로드)
// 은 전혀 영향받지 않으므로 실패를 조용히 무시한다.
export const ServiceWorkerRegistration = () => {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return null;
};
```

- [ ] **Step 3: Render it from `src/app/layout.tsx`**

Add the import alongside the other component-ish imports, and render it as the first child of `<body>`:

```tsx
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
```

```tsx
      <body className="antialiased">
        <ServiceWorkerRegistration />
        {children}
      </body>
```

- [ ] **Step 4: Verify with `tsc`/lint (no runtime test possible here)**

Run: `npx tsc --noEmit && pnpm lint`
Expected: both clean. `sw.js` is plain JS served as a static file, not compiled/linted by the TypeScript/ESLint pipeline — that's expected and fine.

- [ ] **Step 5: Commit**

```bash
git add public/sw.js src/components/ServiceWorkerRegistration.tsx src/app/layout.tsx
git commit -m "feat: add service worker for PWA installability and share-target interception"
```

---

## Task 3: `AnalyzeForm` — accept shared content

**Files:**
- Modify: `src/components/AnalyzeForm.tsx`

No test file (matches this component's existing convention — no Vitest coverage, verified manually).

- [ ] **Step 1: Read the current `src/components/AnalyzeForm.tsx` first** to confirm it matches the shape described below (it should — nothing in Tasks 1-2 touched it). If it differs substantially, stop and report the discrepancy rather than guessing.

- [ ] **Step 2: Add the `useEffect` import**

Replace `import { useRef, useState } from 'react';` with `import { useEffect, useRef, useState } from 'react';`.

- [ ] **Step 3: Extend the props interface**

Replace:

```tsx
interface IAnalyzeFormProps {
  onResult: (result: AnalysisResult, displayText: string) => void;
}
```

with:

```tsx
export type SharedContent = { type: 'sms'; messageBody: string } | { type: 'image'; images: string[] };

interface IAnalyzeFormProps {
  onResult: (result: AnalysisResult, displayText: string) => void;
  initialShared?: SharedContent;
}
```

`SharedContent` is exported here (not redeclared in `page.tsx`) — Task 4's `page.tsx` imports it from this file rather than defining its own copy.

- [ ] **Step 4: Accept the new prop and seed state from it**

Replace:

```tsx
export const AnalyzeForm = ({ onResult }: IAnalyzeFormProps) => {
```

with:

```tsx
export const AnalyzeForm = ({ onResult, initialShared }: IAnalyzeFormProps) => {
```

Then, immediately after the existing `const [images, setImages] = useState<string[]>([]);` line, add:

```tsx

  // 홈페이지가 공유받은 내용(카카오톡/문자 텍스트 또는 갤러리 스크린샷)을
  // 읽어오면 initialShared가 undefined에서 값으로 한 번 바뀐다 — 그 순간에만
  // 해당 탭과 내용을 미리 채운다. 부모는 이 값을 다시 바꾸지 않으므로 별도
  // 가드 없이 [initialShared]에 의존하는 effect로 충분하다.
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

- [ ] **Step 5: Run `tsc`/lint**

Run: `npx tsc --noEmit && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/AnalyzeForm.tsx
git commit -m "feat: let AnalyzeForm seed its state from shared content"
```

---

## Task 4: `page.tsx` — consume shared content on load

**Files:**
- Modify: `src/lib/imageDownscale.ts`
- Modify: `src/app/page.tsx`

Depends on Task 3 (`AnalyzeForm`'s `initialShared` prop must exist). No test file for either change (matches existing convention for both files — no Vitest coverage).

- [ ] **Step 1: Add `dataUrlToFile` to `src/lib/imageDownscale.ts`**

Shared images arrive from the service worker as data URLs (see Task 2), not `File` objects, but `downscaleImage` takes a `File`. Add this new exported function to the file (the existing `downscaleImage` function and its private helpers stay exactly as-is):

```ts
// data URL(예: 서비스 워커가 공유받은 이미지를 저장할 때 만든 것)을 다시
// File 객체로 되돌린다 — downscaleImage가 File을 입력으로 받으므로, 공유
//받은 이미지도 업로드된 이미지와 동일한 다운스케일 경로를 타게 하려면
// 먼저 File로 되돌려야 한다.
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

- [ ] **Step 2: Read the current `src/app/page.tsx` first** to confirm it matches the shape described below (it should). If it differs, stop and report rather than guessing.

- [ ] **Step 3: Replace the entire contents of `src/app/page.tsx`**

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

type SharedPayload = { type: 'sms'; text: string } | { type: 'image'; images: string[] };

const SHARE_COOKIE_NAME = 'shared_content';

const readSharedCookie = (): SharedPayload | null => {
  const match = document.cookie.match(/(?:^|; )shared_content=([^;]*)/);
  if (!match) return null;
  document.cookie = `${SHARE_COOKIE_NAME}=; Max-Age=0; path=/`;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as SharedPayload;
  } catch {
    return null;
  }
};

const readSharedCache = async (): Promise<SharedPayload | null> => {
  try {
    const cache = await caches.open('shared-content');
    const response = await cache.match('/shared-payload');
    if (!response) return null;
    const payload = (await response.json()) as SharedPayload;
    await cache.delete('/shared-payload');
    return payload;
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
  // 있다. 결과가 생기면 그쪽으로 스크롤하고, aria-live로 스크린 리더 사용자
  // 에게도 새 결과가 나타났음을 알린다.
  useEffect(() => {
    if (result) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      resultRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  }, [result]);

  // 서비스 워커가 공유받은 내용을 Cache Storage에 남겨두고 이 페이지로
  // ?shared=1과 함께 리다이렉트했다면(또는, 서비스 워커가 아직 활성화되지
  // 않았던 드문 경우엔 쿠키로) 여기서 한 번 읽어와 폼에 채운다. 공유받은
  // 이미지는 원본 그대로일 수 있어(업로드 흐름과 달리 다운스케일이 적용되지
  // 않음) downscaleImage를 다시 거쳐 업로드 흐름과 동일하게 처리한다.
  useEffect(() => {
    const consumeSharedContent = async () => {
      const url = new URL(window.location.href);
      if (url.searchParams.get('shared') !== '1') return;

      const payload = (await readSharedCache()) ?? readSharedCookie();

      if (payload) {
        if (payload.type === 'sms') {
          setSharedContent({ type: 'sms', messageBody: payload.text });
        } else {
          const downscaled = await Promise.all(
            payload.images.map((dataUrl) => downscaleImage(dataUrlToFile(dataUrl, 'shared-image'))),
          );
          setSharedContent({ type: 'image', images: downscaled });
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

Note: this task's `page.tsx` imports `InstallGuide` from `@/components/InstallGuide`, which doesn't exist until Task 5 completes. If executing tasks strictly in order, this means `tsc`/build will fail between Task 4 and Task 5 — that's expected and fine within a single work session (fix it by doing Task 5 immediately after), but do not merge/ship Task 4 alone without Task 5.

- [ ] **Step 4: Run `tsc`/lint (expect the `InstallGuide` import to fail until Task 5 lands)**

Run: `npx tsc --noEmit`
Expected: FAILS with `Cannot find module '@/components/InstallGuide'` — this is expected at this point; proceed directly to Task 5 before considering Task 4 "done."

- [ ] **Step 5: Commit anyway (Task 5 follows immediately in the same session)**

```bash
git add src/lib/imageDownscale.ts src/app/page.tsx
git commit -m "feat: consume shared content and thread it into AnalyzeForm"
```

---

## Task 5: `InstallGuide` component

**Files:**
- Create: `src/components/InstallGuide.tsx`

Completes the import Task 4 introduced. No test file (matches this project's convention for presentational client components).

- [ ] **Step 1: Create `src/components/InstallGuide.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { ChevronDown, Smartphone } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

// 새 shadcn 컴포넌트나 의존성을 추가하지 않는다 — 펼침/접힘은 다른 곳과
// 동일하게 순수 useState + 조건부 렌더링으로 구현한다.
export const InstallGuide = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Alert role="note" className="mb-5 border-none bg-muted/60">
      <Smartphone className="size-4 text-muted-foreground" aria-hidden="true" />
      <AlertDescription>
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
          <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-sm">
            <li>크롬 메뉴(⋮)에서 &quot;홈 화면에 추가&quot;를 눌러 설치하세요.</li>
            <li>카카오톡·문자 메시지를 길게 눌러 공유를 선택하고, 목록에서 안심스캔을 고르세요.</li>
            <li>갤러리에서 스크린샷을 공유할 때도 안심스캔을 선택할 수 있어요.</li>
            <li>공유한 내용은 이 화면에 자동으로 채워지며, 인증 후 분석하기를 누르면 됩니다.</li>
          </ol>
        )}
      </AlertDescription>
    </Alert>
  );
};
```

- [ ] **Step 2: Run `tsc`/lint — this should now be clean, resolving Task 4's dangling import**

Run: `npx tsc --noEmit && pnpm lint`
Expected: both clean.

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

Run: `pnpm test`
Expected: all pre-existing tests still pass (this feature adds no new Vitest coverage of its own, per the established convention for client-only UI/PWA code — Task 6's server route is the exception).

- [ ] **Step 4: Commit**

```bash
git add src/components/InstallGuide.tsx
git commit -m "feat: add install/usage guide to the home page"
```

---

## Task 6: Server fallback route for `/share-target`

**Files:**
- Create: `src/app/share-target/route.ts`
- Test: `src/app/share-target/route.test.ts`

This only matters in the rare window right after install, before the service worker has activated (see spec §7). Unlike Tasks 1-5, this is server code and gets full TDD coverage, following the existing `route.test.ts` conventions.

- [ ] **Step 1: Write the failing tests**

Create `src/app/share-target/route.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const makeShareRequest = (formData: FormData) => {
  return new NextRequest('http://localhost/share-target', {
    method: 'POST',
    body: formData,
  });
};

describe('POST /share-target', () => {
  it('redirects to /?shared=1 for a text share and sets a cookie with the text', async () => {
    const formData = new FormData();
    formData.set('text', '엄마 나 사고났어 이 계좌로 보내줘');

    const res = await POST(makeShareRequest(formData));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/?shared=1');

    const cookie = res.cookies.get('shared_content');
    expect(cookie).toBeDefined();
    const payload = JSON.parse(decodeURIComponent(cookie!.value));
    expect(payload).toEqual({ type: 'sms', text: '엄마 나 사고났어 이 계좌로 보내줘' });
  });

  it('redirects and sets a cookie with the image data URL for a small image share', async () => {
    const formData = new FormData();
    const smallImage = new File([new Uint8Array([1, 2, 3])], 'shot.jpg', { type: 'image/jpeg' });
    formData.set('images', smallImage);

    const res = await POST(makeShareRequest(formData));
    expect(res.status).toBe(303);

    const cookie = res.cookies.get('shared_content');
    expect(cookie).toBeDefined();
    const payload = JSON.parse(decodeURIComponent(cookie!.value));
    expect(payload.type).toBe('image');
    expect(payload.images[0]).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('prioritizes an image over text when both are shared together', async () => {
    const formData = new FormData();
    formData.set('text', '캡션입니다');
    const smallImage = new File([new Uint8Array([1, 2, 3])], 'shot.jpg', { type: 'image/jpeg' });
    formData.set('images', smallImage);

    const res = await POST(makeShareRequest(formData));
    const cookie = res.cookies.get('shared_content');
    const payload = JSON.parse(decodeURIComponent(cookie!.value));
    expect(payload.type).toBe('image');
  });

  it('redirects without setting a cookie when the image would exceed the cookie size limit', async () => {
    const formData = new FormData();
    // 3000자 상한을 넘도록 충분히 큰 더미 이미지
    const largeImage = new File([new Uint8Array(4000)], 'big.jpg', { type: 'image/jpeg' });
    formData.set('images', largeImage);

    const res = await POST(makeShareRequest(formData));
    expect(res.status).toBe(303);
    expect(res.cookies.get('shared_content')).toBeUndefined();
  });

  it('redirects even when the request body cannot be parsed as form data', async () => {
    const req = new NextRequest('http://localhost/share-target', {
      method: 'POST',
      body: 'not form data at all',
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
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

Create `src/app/share-target/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

const SHARE_COOKIE_NAME = 'shared_content';
const SHARE_COOKIE_MAX_AGE_SECONDS = 60;
// 브라우저 쿠키 크기 제한(도메인당 항목 하나 기준 대략 4KB)을 넘지 않도록
// 여유를 두고 상한을 둔다 — 이미지가 이보다 크면 쿠키에 실어 보낼 수 없다.
const MAX_COOKIE_VALUE_LENGTH = 3000;

type SharedPayload = { type: 'sms'; text: string } | { type: 'image'; images: string[] };

// 서비스 워커가 아직 활성화되지 않은, 설치 직후의 아주 짧은 시간에만 실제로
// 도달하는 경로다 — 정상적으로는 public/sw.js의 fetch 핸들러가 이 요청을
// 가로챈다. 여기 도달한 내용은 어디에도 저장하지 않고, 쿠키에 실어 즉시
// 리다이렉트한다(URL 자체에 내용을 싣지 않는다 — 브라우저 히스토리/서버
// 로그에 노출될 위험이 있다).
export const POST = async (req: NextRequest) => {
  let payload: SharedPayload | null = null;

  try {
    const formData = await req.formData();
    const sharedText = formData.get('text');
    const files = formData
      .getAll('images')
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    // 캡션이 있는 사진 공유처럼 텍스트와 이미지가 동시에 오는 경우, 이미지를
    // 우선한다 — sw.js의 handleShareTarget과 동일한 우선순위.
    if (files.length > 0) {
      const file = files[0];
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const candidate = `data:${file.type};base64,${base64}`;
      if (candidate.length <= MAX_COOKIE_VALUE_LENGTH) {
        payload = { type: 'image', images: [candidate] };
      }
      // 상한을 넘으면 payload를 null로 둔다 — 쿠키 없이 리다이렉트만 하고,
      // 클라이언트는 빈 폼을 보여준다.
    } else if (typeof sharedText === 'string' && sharedText.trim().length > 0) {
      payload = { type: 'sms', text: sharedText };
    }
  } catch {
    // 파싱 실패는 빈 폼으로 이어지도록 조용히 넘어간다.
  }

  const response = NextResponse.redirect(new URL('/?shared=1', req.url), 303);

  if (payload) {
    response.cookies.set(SHARE_COOKIE_NAME, encodeURIComponent(JSON.stringify(payload)), {
      maxAge: SHARE_COOKIE_MAX_AGE_SECONDS,
      path: '/',
    });
  }

  return response;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/share-target/route.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full suite, tsc, and lint**

Run: `pnpm test && npx tsc --noEmit && pnpm lint`
Expected: full suite green, zero type errors, lint clean

- [ ] **Step 6: Commit**

```bash
git add src/app/share-target/route.ts src/app/share-target/route.test.ts
git commit -m "feat: add server-side share-target fallback for pre-activation window"
```

---

## Task 7: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run `pnpm build && pnpm start`, open Chrome DevTools → Application → Manifest**

Confirm the manifest loads with no errors, icons render correctly, and the "Installability" section shows no blocking issues.

- [ ] **Step 2: Install the app**

On an Android device (or Chrome's remote device emulation), use the browser menu's "Add to Home Screen" / install prompt. Confirm it installs and opens in standalone mode (no browser chrome).

- [ ] **Step 3: Share a KakaoTalk message**

Long-press a message in KakaoTalk → Share → confirm 안심스캔 appears in the share sheet → select it → confirm the app opens with the SMS/email tab active and the text pre-filled.

- [ ] **Step 4: Share a gallery screenshot**

From Photos/Gallery, share an image → confirm 안심스캔 appears → select it → confirm the app opens with the screenshot tab active and the image pre-loaded (check it went through the downscale step — inspect via DevTools that the resulting data URL is reasonably sized, not the original multi-MB file).

- [ ] **Step 5: Confirm the existing flow is untouched**

From the pre-filled state in either Step 3 or 4, complete Turnstile verification and click 분석하기 — confirm it behaves exactly like a manually-entered/uploaded submission (same result card, same caching behavior from the result-caching feature).

- [ ] **Step 6: Confirm the guide and iOS notice**

On the home page (any platform), confirm the `InstallGuide` notice is visible near the top, and that "자세히 보기" expands/collapses correctly.

- [ ] **Step 7: (If feasible) Simulate the pre-activation fallback**

Uninstall and reinstall the app, then immediately (before navigating within the app at all, to minimize the chance the service worker has activated) attempt a share. If it still works via the service worker, this edge case wasn't reproduced — that's fine, it's inherently a narrow timing window and the automated tests in Task 6 already cover the fallback route's logic directly.
