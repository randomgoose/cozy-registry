"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Size = { width: number; height: number };
const DEFAULT_STAGE_SIZE: Size = { width: 1200, height: 900 };

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
  /** Default: center. */
  alignY?: "top" | "center";
  /** Default: contain. */
  fitMode?: "contain" | "fill-width" | "fill-height" | "cover";
  /**
   * Optional minimum fraction of the container height the rendered content
   * should occupy. Useful for gallery cards where a strict "fit" can leave
   * too much vertical empty space for short, wide resources.
   */
  minFillHeight?: number;
  /**
   * Caps how far we can zoom beyond the normal fit scale when minFillHeight
   * is applied. Default: 1 (no extra zoom).
   */
  maxFitScaleMultiplier?: number;
  stageSize?: Size;
}) {
  const {
    src,
    title,
    className,
    allowUpscale = true,
    alignY = "center",
    fitMode = "contain",
    minFillHeight = 0,
    maxFitScaleMultiplier = 1,
    stageSize = DEFAULT_STAGE_SIZE,
  } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<Size>({ width: 0, height: 0 });
  const [shouldLoad, setShouldLoad] = useState(false);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loaded = loadedSrc === src;

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
    const el = containerRef.current;
    if (!el || shouldLoad) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldLoad]);

  const transform = useMemo(() => {
    const cw = containerSize.width;
    const ch = containerSize.height;
    const iw = stageSize.width;
    const ih = stageSize.height;

    if (cw <= 0 || ch <= 0 || iw <= 0 || ih <= 0) {
      return {
        scale: 1,
        tx: 0,
        ty: 0,
      };
    }

    const fitScale =
      fitMode === "fill-width"
        ? cw / iw
        : fitMode === "fill-height"
          ? ch / ih
          : fitMode === "cover"
            ? Math.max(cw / iw, ch / ih)
          : Math.min(cw / iw, ch / ih);
    let scale = allowUpscale ? fitScale : Math.min(1, fitScale);
    if (minFillHeight > 0) {
      const desiredScale = (ch * minFillHeight) / ih;
      const boundedDesiredScale = allowUpscale
        ? desiredScale
        : Math.min(1, desiredScale);
      scale = Math.max(scale, boundedDesiredScale);
      if (maxFitScaleMultiplier > 1) {
        scale = Math.min(
          scale,
          (allowUpscale ? fitScale : Math.min(1, fitScale)) * maxFitScaleMultiplier,
        );
      }
    }
    const tx = (cw - iw * scale) / 2;
    const ty = alignY === "top" ? 0 : (ch - ih * scale) / 2;
    return { scale, tx, ty };
  }, [
    alignY,
    allowUpscale,
    containerSize.height,
    containerSize.width,
    fitMode,
    maxFitScaleMultiplier,
    minFillHeight,
    stageSize.height,
    stageSize.width,
  ]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", overflow: "hidden" }}
    >
      <iframe
        src={shouldLoad ? src : undefined}
        title={title}
        sandbox="allow-scripts"
        loading="lazy"
        onLoad={() => setLoadedSrc(src)}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: stageSize.width,
          height: stageSize.height,
          transformOrigin: "top left",
          // transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
          border: 0,
          background: "transparent",
          pointerEvents: "none",
          opacity: loaded ? 1 : 0,
          transition: "opacity 180ms ease-out",
        }}
      />
      {!loaded ? (
        <div className="absolute inset-0 bg-zinc-100/80 dark:bg-zinc-900/80">
          <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.6),transparent_55%)] dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_55%)]" />
        </div>
      ) : null}
    </div>
  );
}
