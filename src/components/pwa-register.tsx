"use client";

import { useEffect } from "react";

const SW_VERSION = "v4";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // 개발 모드에서는 Next 청크가 자주 바뀌므로 SW 캐시를 비워
      // stale 청크로 인한 Internal Server Error를 방지합니다.
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });
      void caches.keys().then((keys) => {
        keys.forEach((key) => {
          void caches.delete(key);
        });
      });
      return;
    }
    void navigator.serviceWorker
      .register(`/sw.js?${SW_VERSION}`, { updateViaCache: "none" })
      .then((registration) => {
        const activateUpdate = () => registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        registration.update().catch(() => Promise.resolve());
        if (registration.waiting) {
          activateUpdate();
        }
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              activateUpdate();
            }
          });
        });
      })
      .catch(() => {
      // 등록 실패 시 앱 사용에는 영향이 없도록 무시합니다.
      });
  }, []);

  return null;
}
