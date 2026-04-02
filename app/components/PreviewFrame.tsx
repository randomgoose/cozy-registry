"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PREVIEW_MSG_RUNTIME_ERROR,
  PREVIEW_MSG_SET_PROPS,
} from "@/lib/preview-messages";

type Size = { width: number; height: number };

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
  /**
   * When true, skip the intersection gate and load the iframe immediately.
   * Use when multiple previews are stacked (e.g. keep-alive); hidden layers
   * can otherwise stay below lazy + IO thresholds and never finish loading.
   */
  loadImmediately?: boolean;
};

type PreviewRuntimeErrorPayload = {
  phase: "render" | "window-error" | "unhandledrejection";
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  debugEnabled: boolean;
};

export const PreviewFrame = forwardRef<PreviewFrameHandle, PreviewFrameProps>(
  function PreviewFrame(props, ref) {
    const { src, title, className, interactive = false, loadImmediately = false } = props;
    const containerRef = useRef<HTMLDivElement | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [intersectionReady, setIntersectionReady] = useState(false);
    const shouldSetSrc = loadImmediately || intersectionReady;
    const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
    const [runtimeError, setRuntimeError] = useState<PreviewRuntimeErrorPayload | null>(null);
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
      function onPreviewMessage(ev: MessageEvent) {
        const iframeWin = iframeRef.current?.contentWindow;
        if (!iframeWin || ev.source !== iframeWin) return;
        const originOk =
          ev.origin === window.location.origin || ev.origin === "null";
        if (!originOk) return;
        const data = ev.data as
          | { type?: string; payload?: PreviewRuntimeErrorPayload }
          | null;
        if (data?.type !== PREVIEW_MSG_RUNTIME_ERROR || !data.payload) return;
        setRuntimeError(data.payload);
      }

      window.addEventListener("message", onPreviewMessage);
      return () => window.removeEventListener("message", onPreviewMessage);
    }, []);

    useEffect(() => {
      const el = containerRef.current;
      if (!el || loadImmediately || intersectionReady) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry?.isIntersecting) return;
          setIntersectionReady(true);
          observer.disconnect();
        },
        { rootMargin: "240px 0px" },
      );

      observer.observe(el);
      return () => observer.disconnect();
    }, [intersectionReady, loadImmediately]);

    const debugSrc = useMemo(() => {
      try {
        const url = new URL(src, window.location.origin);
        if (!url.searchParams.has("debug")) {
          url.searchParams.set("debug", "1");
        }
        return `${url.pathname}${url.search}${url.hash}`;
      } catch {
        return src.includes("?") ? `${src}&debug=1` : `${src}?debug=1`;
      }
    }, [src]);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{ position: "relative", overflow: "hidden" }}
      >
        <iframe
          ref={iframeRef}
          src={shouldSetSrc ? src : undefined}
          title={title}
          sandbox="allow-scripts allow-same-origin"
          loading={loadImmediately ? "eager" : "lazy"}
          onLoad={() => {
            setLoadedSrc(src);
            setRuntimeError(null);
          }}
          style={{
            width: "100%",
            height: "100%",
            border: 0,
            background: "transparent",
            pointerEvents: interactive ? "auto" : "none",
          }}
        />
        {loaded && runtimeError ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 rounded-2xl border border-red-500/35 bg-red-950/88 p-3 text-left text-white shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-200">
              Preview Error
            </p>
            <p className="mt-1 line-clamp-2 text-sm font-medium text-white">
              {runtimeError.message}
            </p>
            <p className="mt-1 text-xs text-red-100/80">
              Phase: {runtimeError.phase}
            </p>
            {!runtimeError.debugEnabled ? (
              <a
                className="pointer-events-auto mt-2 inline-flex text-xs font-medium text-red-100 underline underline-offset-4"
                href={debugSrc}
                target="_blank"
                rel="noreferrer"
              >
                Open debug preview
              </a>
            ) : null}
          </div>
        ) : null}
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
