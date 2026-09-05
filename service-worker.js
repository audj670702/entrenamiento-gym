const CACHE_NAME = "entrenamiento-gym-v0.1.45";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/entrenamiento-gym-logo-sentadilla.png",
  "./assets/scad-powered-logo.png",
  "./assets/clic.mp3",
  "./assets/error.mp3",
  "./assets/exito.mp3",
  "./assets/mensaje-enviado.mp3",
  "./assets/mensaje-pendiente.mp3"
];

const NAVIGATION_TIMEOUT_MS = 3500;
const GYM_CONTEXT_TIMEOUT_MS = 7000;
const SPLASH_SAFETY_TIMEOUT_MS = 4500;

const STARTUP_GUARD_SCRIPT = `
<script data-gym-startup-guard>
(() => {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (resource, init = {}) => {
    const requestUrl = typeof resource === "string"
      ? resource
      : (resource && resource.url) || "";

    if (!requestUrl.includes("/_functions/gymPwaContext") || init.signal) {
      return originalFetch(resource, init);
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), ${GYM_CONTEXT_TIMEOUT_MS});

    return originalFetch(resource, {
      ...init,
      signal: controller.signal
    }).finally(() => window.clearTimeout(timer));
  };

  const markVersion = () => {
    const version = document.querySelector(".version");
    if (!version) return;
    version.textContent = "v0.1.45";
    version.setAttribute("aria-label", "Versión 0.1.45");
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", markVersion, { once: true });
  } else {
    markVersion();
  }

  window.setTimeout(() => {
    if (typeof window.closeSplashScreen === "function") {
      window.closeSplashScreen();
      return;
    }

    const splash = document.getElementById("appSplash");
    if (splash) splash.remove();
  }, ${SPLASH_SAFETY_TIMEOUT_MS});
})();
<\/script>`;

async function fetchWithTimeout(request, options = {}, timeoutMs = NAVIGATION_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(request, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function decorateNavigationResponse(response) {
  if (!response) return response;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  if (html.includes("data-gym-startup-guard")) {
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }

  const decoratedHtml = html.includes("<head>")
    ? html.replace("<head>", `<head>${STARTUP_GUARD_SCRIPT}`)
    : `${STARTUP_GUARD_SCRIPT}${html}`;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");

  return new Response(decoratedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function cachedNavigationResponse() {
  const cached = await caches.match("./index.html") || await caches.match("./");
  return cached ? decorateNavigationResponse(cached) : cached;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  const isNavigation =
    event.request.mode === "navigate" ||
    requestUrl.pathname.endsWith("/") ||
    requestUrl.pathname.endsWith("/index.html");

  if (isNavigation) {
    event.respondWith(
      fetchWithTimeout(event.request, { cache: "no-store" })
        .then(async (response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put("./index.html", copy);
            });
          }
          return decorateNavigationResponse(response);
        })
        .catch(cachedNavigationResponse)
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") {
          return response;
        }

        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
