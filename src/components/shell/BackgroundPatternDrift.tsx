"use client";

import { useEffect } from "react";

const GLIDE_MS = 180;

export default function BackgroundPatternDrift() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".mn-brand-pattern");
    if (!root) return;
    const layers = [...root.querySelectorAll<HTMLElement>(".mn-brand-pattern-layer")];
    const speeds = (root.dataset.speeds ?? "").split(",").map(Number);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (layers.length === 0 || layers.length !== speeds.length) return;

    let tile = 0;
    let drawn = reducedMotion.matches ? 0 : window.scrollY;
    let frame = 0;
    let lastTime = 0;
    const written = layers.map(() => Number.NaN);

    const draw = () => {
      if (!tile) return;
      const ratio = window.devicePixelRatio || 1;
      layers.forEach((layer, index) => {
        const offset = Math.round(((speeds[index]! * drawn) % tile) * ratio);
        if (offset === written[index]) return;
        written[index] = offset;
        layer.style.transform = `translate3d(0, ${(-offset / ratio).toFixed(3)}px, 0)`;
      });
    };

    const step = (now: number) => {
      const elapsed = lastTime ? Math.min(64, now - lastTime) : 16;
      lastTime = now;
      const target = window.scrollY;
      drawn += (target - drawn) * (1 - Math.exp(-elapsed / GLIDE_MS));
      if (Math.abs(target - drawn) < 0.3) {
        drawn = target;
        frame = 0;
        lastTime = 0;
      } else {
        frame = requestAnimationFrame(step);
      }
      draw();
    };

    const measure = () => {
      tile = layers[0]!.offsetHeight / 2;
      draw();
    };

    const observer = new ResizeObserver(measure);
    observer.observe(layers[0]!);
    measure();

    const onScroll = () => {
      if (!frame && !reducedMotion.matches) frame = requestAnimationFrame(step);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
