"use client";

import { useEffect } from "react";

export function PointerSpotlight() {
  useEffect(() => {
    const photoLight = document.getElementById("opening-photo-light");
    const photoLayer = photoLight?.parentElement;
    if (!photoLight || !photoLayer) return;

    const media = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let point: { x: number; y: number } | null = null;
    let frame = 0;

    const hide = () => {
      point = null;
      photoLight.removeAttribute("data-visible");
    };

    const update = () => {
      frame = 0;
      if (!point) return;
      const { x, y } = point;
      const hovered = document.elementFromPoint(x, y);

      const bounds = photoLayer.getBoundingClientRect();
      const inPhoto = Boolean(hovered?.closest("#home-carousel")) &&
        x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
      if (inPhoto) {
        photoLight.style.setProperty("--photo-light-x", `${x - bounds.left}px`);
        photoLight.style.setProperty("--photo-light-y", `${y - bounds.top}px`);
      }
      photoLight.toggleAttribute("data-visible", inPhoto);
    };

    function queueUpdate() {
      if (point && !frame) frame = window.requestAnimationFrame(update);
    }

    function track(event: PointerEvent) {
      if (event.pointerType !== "mouse" || !media.matches) return;
      point = { x: event.clientX, y: event.clientY };
      queueUpdate();
    }

    function leave(event: PointerEvent) {
      if (event.pointerType === "mouse" && !event.relatedTarget) hide();
    }

    window.addEventListener("pointermove", track, { passive: true });
    window.addEventListener("pointerover", track, { passive: true });
    window.addEventListener("pointerout", leave, { passive: true });
    window.addEventListener("scroll", queueUpdate, { passive: true, capture: true });
    window.addEventListener("resize", queueUpdate, { passive: true });
    window.addEventListener("blur", hide);
    media.addEventListener("change", hide);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", track);
      window.removeEventListener("pointerover", track);
      window.removeEventListener("pointerout", leave);
      window.removeEventListener("scroll", queueUpdate, true);
      window.removeEventListener("resize", queueUpdate);
      window.removeEventListener("blur", hide);
      media.removeEventListener("change", hide);
      hide();
    };
  }, []);

  return null;
}
