# 안심스캔 — UI/UX 디자인 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Use the `frontend-design` skill while implementing the visual tasks. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Restyle 안심스캔 into the approved "A+C" direction — calm blue (`#2563eb`) + soft surfaces, modern-compact layout with tighter spacing, a cohesive icon/wordmark identity, decluttered notices, and a high-impact result card — **without touching any logic** (analysis, API, security, PWA behavior) and **without new dependencies**.

**Architecture:** Almost everything flows from design tokens in `globals.css` (brand blue, warm off-white background) plus targeted restyles of client components. Dark mode is removed (light-only). The two stacked gray notices become one slim bar + a collapsible detail. The result card gets a colored verdict header and a promoted "이렇게 하세요" action callout. PWA icons + manifest `theme_color` are regenerated to the new blue so the app icon and in-app hero match.

**Tech Stack:** Next.js 16.2.10, TypeScript, Tailwind v4 (shadcn/Base UI components), Vitest. No new deps. Icons via `qlmanage`+`sips` (macOS built-ins).

**Reference spec:** `docs/superpowers/specs/2026-07-15-design-overhaul-design.md` (and the approved visual-companion mockup `home-merged.html`).

**Branch:** `feature/design-overhaul` (already cut from `develop`).

**Testing note:** This is a visual overhaul of client/presentational code, which this project verifies **manually** (no Vitest for UI, per convention). So "tests" here = `npx tsc --noEmit`, `pnpm lint`, `pnpm build`, and a manual visual QA pass — plus confirming the **existing** automated suite still passes (no regressions), since no logic changes.

**Execution note (parallelism):** Task 1 (tokens) must land first. After that, Tasks 2, 3, 5, 6, 7 touch disjoint files and can run in parallel; Task 4 depends on Task 3; Task 8 is last. Review as one batch at the end (per the established preference).

---

## Task 1: Design tokens + remove dark mode

**Files:** Modify `src/app/globals.css`, `src/app/layout.tsx`

- [ ] **Step 1: Set the brand blue + warm background in `src/app/globals.css`**

In the `:root { … }` block, change these three lines:

```css
  --primary: #1a56db;
```
→
```css
  --primary: #2563eb;
```

```css
  --ring: #1a56db;
```
→
```css
  --ring: #2563eb;
```

```css
  --background: oklch(1 0 0);
```
→
```css
  /* 따뜻한 오프화이트 페이지 배경 — 흰색 카드가 배경 위에서 살짝 떠 보이게 한다. */
  --background: #f6f8fc;
```

(Leave `--card: oklch(1 0 0)` white so cards stand out on the off-white page.)

- [ ] **Step 2: Remove the dark-mode token block**

Delete the entire `.dark { … }` block (the `--background` through `--sidebar-ring` overrides under `.dark`).

**Keep** the line `@custom-variant dark (&:is(.dark *));` near the top. This is intentional and important: it keeps Tailwind's `dark:` variant **class-based**. Nothing in the app adds a `.dark` class, so dark styles never render. If we removed this line, `dark:` would fall back to Tailwind v4's default `prefers-color-scheme` media query — which would make the leftover `dark:` utilities still present in generated shadcn `ui/*` components (e.g. `tabs.tsx`, `button.tsx`) activate on a user's OS dark setting, producing a broken partial dark mode. Keeping the class-based variant makes those leftover `dark:` classes inert. (App-level components we rewrite in later tasks drop their `dark:` classes as cleanup.)

Add a short comment above the kept line:

```css
/* 다크 모드는 지원하지 않는다(라이트 전용). 이 변수를 클래스 기반으로 유지해,
   생성된 shadcn 컴포넌트에 남아있는 dark: 유틸리티가 OS 다크 설정으로
   활성화되는 것을 막는다(.dark 클래스는 어디서도 추가하지 않음). */
@custom-variant dark (&:is(.dark *));
```

- [ ] **Step 3: Update the theme-color in `src/app/layout.tsx`**

```ts
export const viewport: Viewport = {
  themeColor: '#1a56db',
};
```
→
```ts
export const viewport: Viewport = {
  themeColor: '#2563eb',
};
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && pnpm lint && pnpm build`
Expected: clean. Then `pnpm dev` and eyeball the home page — background is now soft off-white, primary elements (button, focus ring) are the brighter blue, and nothing renders dark even if your OS is in dark mode.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(design): brand blue #2563eb, warm background, remove dark mode"
```

---

## Task 2: Regenerate PWA icons + manifest color

**Files:** Overwrite `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`; modify `public/manifest.json`

No automated test — verified visually (Task 8). Same generation flow as the PWA feature, only the background color changes to `#2563eb`.

- [ ] **Step 1: Author the icon source HTML** at `$CLAUDE_JOB_DIR/tmp/icon-src/icon.html`:

```html
<!DOCTYPE html>
<html>
<head><style>
  html, body { margin: 0; padding: 0; }
  .icon { width: 100vw; height: 100vw; background: #2563eb; display: flex; align-items: center; justify-content: center; }
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

And `$CLAUDE_JOB_DIR/tmp/icon-src/icon-maskable.html` — identical except `svg { width: 45%; height: 45%; }` (adaptive-icon safe zone). Note the `100vw` box (learned in the PWA feature — a fixed `512px` box renders into only the top-left quadrant under `qlmanage`).

- [ ] **Step 2: Rasterize + resize**

```bash
SRC="$CLAUDE_JOB_DIR/tmp/icon-src"
qlmanage -t -s 1024 -o "$SRC" "$SRC/icon.html"
qlmanage -t -s 1024 -o "$SRC" "$SRC/icon-maskable.html"
sips -z 512 512 "$SRC/icon.html.png"          --out public/icons/icon-512.png
sips -z 192 192 "$SRC/icon.html.png"          --out public/icons/icon-192.png
sips -z 512 512 "$SRC/icon-maskable.html.png" --out public/icons/icon-maskable-512.png
sips -z 192 192 "$SRC/icon-maskable.html.png" --out public/icons/icon-maskable-192.png
rm -rf "$SRC"
```

- [ ] **Step 3: Verify** — `file public/icons/*.png` (correct sizes), and open `public/icons/icon-512.png` to confirm a solid `#2563eb` background with a centered white shield. If `qlmanage` misbehaves, regenerate by any means (these are one-time static assets).

- [ ] **Step 4: Update `public/manifest.json`** — change `"theme_color": "#1a56db"` to `"theme_color": "#2563eb"`.

- [ ] **Step 5: Commit**

```bash
git add public/icons public/manifest.json
git commit -m "feat(design): regenerate app icons and manifest theme_color to #2563eb"
```

---

## Task 3: Consolidated `HomeNotice` + restyle `InstallButton`

**Files:** Create `src/components/HomeNotice.tsx`; modify `src/components/InstallButton.tsx`

Replaces the two stacked gray boxes (`PrivacyNotice` + `InstallGuide`) with one slim privacy bar + a collapsible "자세히" detail that preserves **all** existing info (privacy, install steps, usage steps, iOS-unsupported, usage limits) and embeds the install button. `PrivacyNotice.tsx`/`InstallGuide.tsx` are deleted in Task 4 (after `page.tsx` stops importing them). No test files (presentational).

- [ ] **Step 1: Restyle `src/components/InstallButton.tsx`**

Keep all `beforeinstallprompt`/`appinstalled`/standalone logic exactly as-is. Only change the returned button's markup/classes to an on-brand, calm CTA:

Replace the final `return (…)`:

```tsx
  return (
    <Button type="button" variant="outline" onClick={handleInstall} className="mb-3 w-full">
      <Download className="size-4" aria-hidden="true" />
      홈 화면에 추가
    </Button>
  );
```

with:

```tsx
  return (
    <button
      type="button"
      onClick={handleInstall}
      className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
    >
      <Download className="size-4" aria-hidden="true" />
      홈 화면에 추가하고 공유로 바로 검사하기
    </button>
  );
```

Remove the now-unused `Button` import (`import { Button } from '@/components/ui/button';`) since we switched to a plain styled `button`.

- [ ] **Step 2: Create `src/components/HomeNotice.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { InstallButton } from '@/components/InstallButton';

// PrivacyNotice + InstallGuide를 하나로 합친 슬림 안내. 기본은 개인정보 한 줄 +
// "자세히" 토글이고, 펼치면 설치·사용 방법·iOS 미지원·무료 사용량 한도를 모두
// 담는다(기존 정보 보존). 시각만 정리했고 새 의존성/컴포넌트는 없다.
export const HomeNotice = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-5">
      <InstallButton />

      <div className="flex items-center justify-between gap-2 rounded-xl bg-blue-50/70 px-3.5 py-2.5">
        <span className="flex items-center gap-1.5 text-xs text-slate-600">
          <ShieldCheck className="size-3.5 shrink-0 text-blue-600" aria-hidden="true" />
          입력한 내용은 저장하지 않아요
        </span>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-blue-700"
        >
          자세히
          <ChevronDown
            className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-600">
          <p>
            민감한 개인정보(계좌번호, 주민등록번호 등)는 가급적 제외하고 입력하세요. 스크린샷은
            개인정보가 보이는 부분을 잘라내고 올려주세요. 입력한 내용은 분석을 위해 Google Gemini
            또는 Groq API(무료 티어)로 전송되며, 이 서비스는 어떤 내용도 저장하지 않습니다.
          </p>
          <div>
            <p className="mb-1 font-semibold text-slate-700">홈 화면에 추가해서 쓰기 (안드로이드)</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>위 &quot;홈 화면에 추가&quot; 버튼(또는 크롬 메뉴 ⋮ → &quot;홈 화면에 추가&quot;)으로 설치하세요.</li>
              <li>카카오톡·문자 메시지를 길게 눌러 공유 → 목록에서 안심스캔을 선택하세요.</li>
              <li>갤러리에서 스크린샷을 공유할 때도 안심스캔을 고를 수 있어요.</li>
              <li>공유한 내용은 이 화면에 자동으로 채워지며, 인증 후 분석하기를 누르면 됩니다.</li>
            </ol>
            <p className="mt-1 text-xs text-slate-500">iOS는 공유 대상 등록을 지원하지 않아요 — 복사·붙여넣기로 이용해주세요.</p>
          </div>
          <p className="text-xs text-slate-500">
            무료로 운영되는 서비스라 하루 사용량에 제한이 있어요. 한도에 도달하면 &quot;오늘의 무료
            사용량을 모두 사용했습니다&quot; 안내가 나타날 수 있으며, 다음 날 다시 이용할 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit && pnpm lint` (clean). Not yet used by `page.tsx`; that's Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/components/HomeNotice.tsx src/components/InstallButton.tsx
git commit -m "feat(design): consolidate notices into a slim HomeNotice + restyle install CTA"
```

---

## Task 4: New hero + wire `HomeNotice` into `page.tsx`

**Files:** Modify `src/app/page.tsx`; delete `src/components/PrivacyNotice.tsx`, `src/components/InstallGuide.tsx`

Depends on Task 3. Keep ALL share-consumption logic (`readSharedFromCache`/`readSharedFromCookie`/the effects) untouched — only the imports and the JSX (hero + notices) change.

- [ ] **Step 1: Swap imports in `src/app/page.tsx`**

Replace:
```tsx
import { PrivacyNotice } from '@/components/PrivacyNotice';
import { InstallGuide } from '@/components/InstallGuide';
```
with:
```tsx
import { HomeNotice } from '@/components/HomeNotice';
```

- [ ] **Step 2: Replace the hero block**

Replace:
```tsx
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
```
with (compact horizontal lockup matching the app icon — rounded-square gradient tile + wordmark):
```tsx
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="flex items-center gap-2.5">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-md shadow-blue-600/30">
            <ShieldCheck className="size-6 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">안심스캔</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          문자·이메일·스크린샷, 사기인지 바로 확인
        </p>
      </div>
```

- [ ] **Step 3: Replace the notices**

Replace:
```tsx
      <InstallGuide />
      <PrivacyNotice />
```
with:
```tsx
      <HomeNotice />
```

- [ ] **Step 4: Delete the retired components**

```bash
git rm src/components/PrivacyNotice.tsx src/components/InstallGuide.tsx
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit && pnpm lint && pnpm build`. Expected clean (no dangling imports; `ShieldCheck` is still imported in `page.tsx`). Confirm nothing else imported `PrivacyNotice`/`InstallGuide`: `grep -rn "PrivacyNotice\|InstallGuide" src/` should return nothing.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/components/PrivacyNotice.tsx src/components/InstallGuide.tsx
git commit -m "feat(design): compact hero lockup and slim notice on the home page"
```

---

## Task 5: Restyle `AnalyzeForm`

**Files:** Modify `src/components/AnalyzeForm.tsx`

The Tabs primitive already renders a segmented control, so this is light: a gradient submit button, tighter rhythm, and dropping the one `dark:` class. Keep ALL state/logic/Turnstile handling. No test file.

- [ ] **Step 1: Gradient submit button.** Replace:
```tsx
            <Button type="submit" disabled={loading} className="flex-1">
```
with:
```tsx
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gradient-to-br from-blue-600 to-blue-700 shadow-sm shadow-blue-600/25 hover:from-blue-700 hover:to-blue-800"
            >
```

- [ ] **Step 2: Remove the dark-mode class on the char counter.** Replace:
```tsx
      ? 'text-amber-600 dark:text-amber-400'
```
with:
```tsx
      ? 'text-amber-600'
```

- [ ] **Step 3: Slightly tighten the segmented tabs to brand.** On the `<TabsTrigger>` elements, the active state already uses `data-active:bg-background`; add a brand-colored active text by appending to each trigger's className `data-active:text-primary`. Example — replace `className="flex-1"` on all three `TabsTrigger` with `className="flex-1 data-active:text-primary data-active:font-semibold"`.

- [ ] **Step 4: Verify** — `npx tsc --noEmit && pnpm lint`. Then visually check the form: segmented tabs with a blue active label, a blue gradient 분석하기 button, no dark rendering.

- [ ] **Step 5: Commit**

```bash
git add src/components/AnalyzeForm.tsx
git commit -m "feat(design): restyle analyze form — gradient submit, brand tabs, drop dark class"
```

---

## Task 6: Restyle `ImageUploader` drop zone

**Files:** Modify `src/components/ImageUploader.tsx`

Keep all upload/drag/paste/downscale logic. Just soften the drop zone to match. No test file.

- [ ] **Step 1: Restyle the drop zone.** Replace the dropzone `className` template literal:
```tsx
        className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          isDraggingOver ? 'border-primary bg-primary/5' : 'border-input'
        }`}
```
with:
```tsx
        className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          isDraggingOver ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50'
        }`}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit && pnpm lint`. Check the 스크린샷 tab: a soft rounded drop zone that turns blue on drag.

- [ ] **Step 3: Commit**

```bash
git add src/components/ImageUploader.tsx
git commit -m "feat(design): soften image uploader drop zone to match"
```

---

## Task 7: Redesign `ResultCard`

**Files:** Modify `src/components/ResultCard.tsx`

The signature change: a colored verdict header (icon tile + big verdict + plain-language subline + prominent score) and the recommended action promoted to an emphasized callout. Keep `highlightEvidence`, the `displayText` logic, the h2/h3 structure, `mark` highlights, and `aria` attributes. Drop all `dark:` classes. Uses the shadcn `Progress` component (no inline `style`). No test file.

- [ ] **Step 1: Replace the entire contents of `src/components/ResultCard.tsx`**

```tsx
import { ShieldAlert, ShieldCheck, ShieldQuestion, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { highlightEvidence } from '@/lib/highlightEvidence';
import type { AnalysisResult } from '@/lib/analysis/types';

interface IResultCardProps {
  result: AnalysisResult;
  originalText: string;
  onClear: () => void;
}

// 판정별 시각. header는 헤더 틴트 그라디언트, tile은 아이콘 타일 배경,
// score는 점수 텍스트 색, progress는 Base UI Progress의 인디케이터 색을
// data-slot 임의 변형으로 입힌다(생성된 progress.tsx를 직접 수정하지 않음).
const VERDICT_STYLE: Record<
  AnalysisResult['verdict'],
  {
    icon: LucideIcon;
    subtitle: string;
    header: string;
    tile: string;
    score: string;
    progress: string;
  }
> = {
  안전: {
    icon: ShieldCheck,
    subtitle: '사기 신호가 발견되지 않았어요',
    header: 'from-green-50 to-green-100/70',
    tile: 'bg-green-600',
    score: 'text-green-700',
    progress: '[&_[data-slot=progress-indicator]]:bg-green-600',
  },
  의심: {
    icon: ShieldQuestion,
    subtitle: '주의가 필요해요 — 함부로 응답하지 마세요',
    header: 'from-amber-50 to-amber-100/70',
    tile: 'bg-amber-500',
    score: 'text-amber-600',
    progress: '[&_[data-slot=progress-indicator]]:bg-amber-500',
  },
  위험: {
    icon: ShieldAlert,
    subtitle: '사기일 가능성이 매우 높아요',
    header: 'from-red-50 to-red-100/70',
    tile: 'bg-red-600',
    score: 'text-red-600',
    progress: '[&_[data-slot=progress-indicator]]:bg-red-600',
  },
};

export const ResultCard = ({ result, originalText, onClear }: IResultCardProps) => {
  const style = VERDICT_STYLE[result.verdict];
  const VerdictIcon = style.icon;
  // 이미지 모드에서는 API가 판독한 extractedText가 우선, 텍스트 모드에서는
  // 폼이 넘긴 원본(originalText)으로 대체.
  const displayText = result.extractedText || originalText;
  const evidences = result.redFlags.map((redFlag) => redFlag.evidence);
  const segments = displayText ? highlightEvidence(displayText, evidences) : [];
  const score = Math.round(result.riskScore);

  return (
    <Card className="mt-6 gap-0 overflow-hidden p-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      {/* 판정 헤더 — 가장 중요한 출력을 크게. CardTitle은 <div>라 헤딩 트리에
          안 잡히므로 실제 <h2>를 써서 페이지 h1 아래 계층을 유지한다. */}
      <div className={`flex items-center gap-3 bg-gradient-to-br ${style.header} p-4`}>
        <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${style.tile} shadow-sm`}>
          <VerdictIcon className="size-6 text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-2xl leading-none font-extrabold tracking-tight text-slate-900">
            {result.verdict}
          </h2>
          <p className="mt-1.5 text-xs text-slate-600">{style.subtitle}</p>
        </div>
        <div className="ml-auto text-right">
          <div className={`text-3xl leading-none font-extrabold ${style.score}`}>{score}</div>
          <div className="text-[11px] text-slate-500">/ 100</div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <Progress value={result.riskScore} aria-label={`위험도 ${score}점`} className={style.progress} />

        {displayText && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              {result.extractedText ? '판독된 메시지' : '분석한 메시지'}
            </h3>
            <p className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {segments.map((segment, index) =>
                segment.highlighted ? (
                  <mark key={index} className="rounded bg-amber-200/70 px-0.5">
                    {segment.text}
                  </mark>
                ) : (
                  <span key={index}>{segment.text}</span>
                ),
              )}
            </p>
          </div>
        )}

        {result.redFlags.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">주요 위험 신호</h3>
            <ul className="space-y-1.5">
              {result.redFlags.map((redFlag, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
                  <span className="min-w-0">{redFlag.flag}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-sm text-muted-foreground">{result.explanation}</p>

        {/* 권장 조치를 강조 콜아웃으로 승격 — 사용자가 가장 먼저 봐야 할 다음 행동. */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5">
          <p className="mb-1 text-xs font-bold tracking-wide text-blue-700">이렇게 하세요</p>
          <p className="text-sm leading-relaxed font-semibold text-blue-900">
            {result.recommendedAction}
          </p>
        </div>

        <div className="pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
            결과 지우기
          </Button>
        </div>
      </div>
    </Card>
  );
};
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit && pnpm lint`. Manually check all three verdicts (temporarily hardcode a result, or run a real analysis): the big colored header, prominent score, highlighted evidence, and the blue "이렇게 하세요" callout. Confirm no dark rendering.

- [ ] **Step 3: Commit**

```bash
git add src/components/ResultCard.tsx
git commit -m "feat(design): high-impact result card header + promoted action callout"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Automated regression** — `pnpm test` (all existing tests still pass — no logic changed), then `npx tsc --noEmit`, `pnpm lint`, `pnpm build`. All green.

- [ ] **Step 2: Confirm no dark leakage** — `grep -rn "\.dark\|prefers-color-scheme" src/app/globals.css` shows only the kept class-based `@custom-variant` line and the reduced-motion media query (no `.dark {}` block). Set your OS to dark mode and load the app — it must stay light.

- [ ] **Step 3: Manual visual QA** (`pnpm build && pnpm start`), mobile + desktop widths:
  - Hero: gradient tile + "안심스캔" lockup + tagline; tighter spacing (no big gaps).
  - Notice: single slim bar; "자세히" expands to show privacy + install steps + usage + iOS note + usage-limits; install button appears only when installable.
  - Form: segmented tabs (blue active), inputs, blue gradient 분석하기.
  - Image tab: softened drop zone, blue on drag.
  - Result card for **all three verdicts** (안전/의심/위험): colored header, score, progress color, evidence highlight, "이렇게 하세요" callout.
  - Image-mode result shows extractedText; share-fill (`?shared=1`) still populates the form; Turnstile + analyze still work.
  - Brand blue is consistent across hero, buttons, and (installed) app icon; manifest `theme_color` = `#2563eb`.

- [ ] **Step 4:** Push the branch and open a PR to `develop` (human squash-merges per `AGENTS.md`).
