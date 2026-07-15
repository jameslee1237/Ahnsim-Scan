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
