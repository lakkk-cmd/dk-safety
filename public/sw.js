const CACHE_NAME = "dk-safety-static-v4";
const PRECACHE_URLS = ["/logo-daekyung.png"];

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => Promise.resolve())
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = event.request.mode === "navigate";
  const isApiRequest = isSameOrigin && url.pathname.startsWith("/api/");
  // 청크 불일치 이슈 방지를 위해 /_next/* 와 JS/CSS는 캐시하지 않습니다.
  const isCacheableAsset =
    isSameOrigin && /\.(?:png|jpg|jpeg|webp|gif|svg|ico|woff2?)$/i.test(url.pathname);

  // 문서 페이지는 항상 네트워크 우선으로 가져와 수정된 화면을 즉시 반영합니다.
  if (isNavigation) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request))
    );
    return;
  }

  // API 응답은 캐시하지 않고 매번 최신 응답을 사용합니다.
  if (isApiRequest) {
    event.respondWith(fetch(event.request));
    return;
  }

  // /_next/* 및 js/css는 항상 네트워크 우선(사실상 무캐시)으로 가져옵니다.
  if (isSameOrigin && (url.pathname.startsWith("/_next/") || /\.(?:js|css)$/i.test(url.pathname))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 이미지/아이콘/폰트는 캐시를 활용하되 백그라운드 갱신합니다.
  if (isCacheableAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned)).catch(() => Promise.resolve());
            return response;
          })
          .catch(() => cached);
        return cached ?? networkFetch;
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
