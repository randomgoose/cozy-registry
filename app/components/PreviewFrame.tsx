"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Size = { width: number; height: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function PreviewFrame(props: {
  src: string;
  title: string;
  /**
   * Container size should be controlled by parent (e.g. fixed height).
   * This component will fit-and-center the iframe content into that box.
   */
  className?: string;
  /** Default: true. */
  allowUpscale?: boolean;
}) {
  const { src, title, className, allowUpscale = true } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [contentSize, setContentSize] = useState<Size>({ width: 800, height: 400 });
  const [containerSize, setContainerSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setContainerSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const frame = iframeRef.current;
      if (!frame) return;
      if (e.source !== frame.contentWindow) return;

      const data = e.data;
      if (!isPreviewSizeMessage(data)) return;
      const w = Number(data.width);
      const h = Number(data.height);
      if (!Number.isFinite(w) || !Number.isFinite(h)) return;
      if (w <= 0 || h <= 0) return;

      setContentSize({
        width: clamp(Math.round(w), 1, 10000),
        height: clamp(Math.round(h), 1, 10000),
      });
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const transform = useMemo(() => {
    const cw = containerSize.width;
    const ch = containerSize.height;
    const iw = contentSize.width;
    const ih = contentSize.height;

    if (cw <= 0 || ch <= 0 || iw <= 0 || ih <= 0) {
      return {
        scale: 1,
        tx: 0,
        ty: 0,
      };
    }

    const s = Math.min(cw / iw, ch / ih);
    const scale = allowUpscale ? s : Math.min(1, s);
    const tx = (cw - iw * scale) / 2;
    const ty = (ch - ih * scale) / 2;
    return { scale, tx, ty };
  }, [allowUpscale, containerSize.height, containerSize.width, contentSize.height, contentSize.width]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", overflow: "hidden" }}
    >
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        sandbox="allow-scripts"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: contentSize.width,
          height: contentSize.height,
          transformOrigin: "top left",
          transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
          border: 0,
          background: "transparent",
        }}
      />
    </div>
  );
}

function isPreviewSizeMessage(
  data: unknown,
): data is { type: "cozy-preview:size"; width: number; height: number } {
  if (!data || typeof data !== "object") return false;
  const rec = data as Record<string, unknown>;
  if (rec.type !== "cozy-preview:size") return false;
  return typeof rec.width === "number" && typeof rec.height === "number";
}

