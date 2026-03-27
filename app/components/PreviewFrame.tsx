"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { PREVIEW_MSG_SET_PROPS } from "@/lib/preview-messages";

type Size = { width: number; height: number };
const DEFAULT_STAGE_SIZE: Size = { width: 1200, height: 900 };

export type PreviewFrameHandle = {
  sendPreviewProps: (props: Record<string, unknown>) => void;
  getContentWindow: () => Window | null;
};

export type PreviewFrameProps = {
  src: string;
  title: string;
  /**
   * Container size should be controlled by parent (e.g. fixed height).
   * With `fitMode="actual"` the stage keeps 1:1 size and is centered (clipped);
   * other modes scale the stage to fit.
   */
  className?: string;
  /** Default: true. */
  allowUpscale?: boolean;
  /** Default: center. */
  alignX?: "left" | "center";
  /** Default: center. */
  alignY?: "top" | "center";
  /**
   * How the stage (iframe layout size) maps into the container.
   * `actual`: scale always 1 — preview keeps true pixel size; container clips and centers.
   */
  fitMode?: "contain" | "fill-width" | "fill-height" | "cover" | "actual";
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
  interactive?: boolean;
};

export const PreviewFrame = forwardRef<PreviewFrameHandle, PreviewFrameProps>(
  function PreviewFrame(props, ref) {
    const {
      src,
      title,
      className,
      allowUpscale = true,
      alignX = "center",
      alignY = "center",
      fitMode = "contain",
      minFillHeight = 0,
      maxFitScaleMultiplier = 1,
      stageSize = DEFAULT_STAGE_SIZE,
      interactive = false,
    } = props;
    const containerRef = useRef<HTMLDivElement | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [containerSize, setContainerSize] = useState<Size>({ width: 0, height: 0 });
    const [shouldLoad, setShouldLoad] = useState(false);
    const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
    const loaded = loadedSrc === src;

    useImperativeHandle(
      ref,
      () => ({
        sendPreviewProps: (nextProps) => {
          const w = iframeRef.current?.contentWindow;
          if (!w) return;
          w.postMessage(
            { type: PREVIEW_MSG_SET_PROPS, props: nextProps },
            window.location.origin,
          );
        },
        getContentWindow: () => iframeRef.current?.contentWindow ?? null,
      }),
      [],
    );

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

      if (fitMode === "actual") {
        const scale = 1;
        const tx = alignX === "left" ? 0 : (cw - iw * scale) / 2;
        const ty = alignY === "top" ? 0 : (ch - ih * scale) / 2;
        return { scale, tx, ty };
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
      const tx = alignX === "left" ? 0 : (cw - iw * scale) / 2;
      const ty = alignY === "top" ? 0 : (ch - ih * scale) / 2;
      return { scale, tx, ty };
    }, [
      alignX,
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
          ref={iframeRef}
          src={shouldLoad ? src : undefined}
          title={title}
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
          onLoad={() => setLoadedSrc(src)}
          style={{
            width: "100%",
            height: "100%",
            border: 0,
            background: "transparent",
            pointerEvents: interactive ? "auto" : "none",
          }}
        />
        {!loaded ? (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[linear-gradient(180deg,rgba(250,250,249,0.96),rgba(244,244,245,0.98))] dark:bg-[linear-gradient(180deg,rgba(24,24,27,0.96),rgba(9,9,11,0.98))]"
            aria-busy="true"
            aria-live="polite"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_380px_at_50%_18%,rgba(255,255,255,0.55),transparent_62%)] opacity-80 dark:bg-[radial-gradient(circle_380px_at_50%_18%,rgba(255,255,255,0.1),transparent_62%)] dark:opacity-100" />
            <div className="pointer-events-none absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent_35%,rgba(255,255,255,0.22)_50%,transparent_65%)] opacity-60 dark:bg-[linear-gradient(110deg,transparent_35%,rgba(255,255,255,0.06)_50%,transparent_65%)]" />
            <div className="relative flex flex-col items-center gap-3">
              <div
                className="h-9 w-9 animate-spin rounded-full border-2 border-zinc-300/80 border-t-zinc-800 dark:border-zinc-600 dark:border-t-zinc-100"
                aria-hidden
              />
              <p className="text-xs font-medium tracking-wide text-zinc-500 dark:text-zinc-400">
                Loading preview…
              </p>
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

PreviewFrame.displayName = "PreviewFrame";
