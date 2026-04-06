"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PREVIEW_MSG_RUNTIME_ERROR,
  PREVIEW_MSG_SET_PROPS,
  PREVIEW_MSG_SET_THEME_PATCH,
} from "@/lib/preview-messages";

type Size = { width: number; height: number };

export type PreviewFrameHandle = {
  sendPreviewProps: (props: Record<string, unknown>) => void;
  getContentWindow: () => Window | null;
};

export type PreviewFrameProps = {
  src: string;
  title: string;
  className?: string;
  /** Default: true. */
  allowUpscale?: boolean;
  /** Default: center. */
  alignX?: "left" | "center";
  /** Default: center. */
  alignY?: "top" | "center";
  fitMode?: "contain" | "fill-width" | "fill-height" | "cover" | "actual";
  minFillHeight?: number;
  maxFitScaleMultiplier?: number;
  stageSize?: Size;
  interactive?: boolean;
  /**
   * When true, skip the intersection gate and load the iframe immediately.
   */
  loadImmediately?: boolean;
  /** Optional runtime CSS variable patch for live style preview. */
  draftThemePatch?: Record<string, string> | null;
};

type PreviewRuntimeErrorPayload = {
  phase: "render" | "window-error" | "unhandledrejection";
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  debugEnabled: boolean;
};

/**
 * Two-slot iframe swap: we keep two iframe DOM elements so the user never sees
 * a blank flash when `src` changes. The "front" slot stays visible with the
 * previously loaded content while the "back" slot silently loads the new URL.
 * Once the back slot fires `onLoad`, the slots swap roles.
 */
const PreviewFrameInner = forwardRef<PreviewFrameHandle, PreviewFrameProps>(
  function PreviewFrame(props, ref) {
    const {
      src,
      title,
      className,
      interactive = false,
      loadImmediately = false,
      draftThemePatch = null,
    } = props;
    const containerRef = useRef<HTMLDivElement | null>(null);
    const srcRef = useRef(src);
    useLayoutEffect(() => { srcRef.current = src; });

    const [intersectionReady, setIntersectionReady] = useState(false);
    const shouldSetSrc = loadImmediately || intersectionReady;

    const iframe0Ref = useRef<HTMLIFrameElement | null>(null);
    const iframe1Ref = useRef<HTMLIFrameElement | null>(null);

    const [front, setFront] = useState(0);
    const frontRef = useRef(0);
    useLayoutEffect(() => { frontRef.current = front; }, [front]);

    const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
    const hasEverLoaded = loadedSrc !== null;
    const isFullyLoaded = loadedSrc === src;

    const [runtimeError, setRuntimeError] = useState<
      PreviewRuntimeErrorPayload | null
    >(null);

    const back = 1 - front;

    const slotSrcs: [string | undefined, string | undefined] = useMemo(() => {
      const srcs: [string | undefined, string | undefined] = [undefined, undefined];
      if (!hasEverLoaded) {
        srcs[front] = shouldSetSrc ? src : undefined;
      } else if (isFullyLoaded) {
        srcs[front] = src;
      } else {
        srcs[front] = loadedSrc!;
        srcs[back] = shouldSetSrc ? src : undefined;
      }
      return srcs;
    }, [hasEverLoaded, isFullyLoaded, front, back, shouldSetSrc, src, loadedSrc]);

    const expectedSrcsRef = useRef(slotSrcs);
    useLayoutEffect(() => { expectedSrcsRef.current = slotSrcs; }, [slotSrcs]);

    useImperativeHandle(
      ref,
      () => ({
        sendPreviewProps: (nextProps) => {
          const w = (
            frontRef.current === 0 ? iframe0Ref : iframe1Ref
          ).current?.contentWindow;
          if (!w) return;
          w.postMessage(
            { type: PREVIEW_MSG_SET_PROPS, props: nextProps },
            window.location.origin,
          );
        },
        getContentWindow: () =>
          (frontRef.current === 0 ? iframe0Ref : iframe1Ref).current
            ?.contentWindow ?? null,
      }),
      [],
    );

    useEffect(() => {
      if (!isFullyLoaded) return;
      const w = (
        frontRef.current === 0 ? iframe0Ref : iframe1Ref
      ).current?.contentWindow;
      if (!w) return;
      const patch =
        draftThemePatch && Object.keys(draftThemePatch).length > 0
          ? draftThemePatch
          : {};
      w.postMessage(
        { type: PREVIEW_MSG_SET_THEME_PATCH, patch },
        window.location.origin,
      );
    }, [draftThemePatch, isFullyLoaded]);

    useEffect(() => {
      function onPreviewMessage(ev: MessageEvent) {
        const frontIframe = (
          frontRef.current === 0 ? iframe0Ref : iframe1Ref
        ).current;
        const iframeWin = frontIframe?.contentWindow;
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

    const handleSlotLoad = useCallback((slot: number) => {
      const currentDesiredSrc = srcRef.current;
      const expectedSrc = expectedSrcsRef.current[slot];

      if (expectedSrc !== currentDesiredSrc) return;

      setLoadedSrc(currentDesiredSrc);
      setRuntimeError(null);

      if (slot !== frontRef.current) {
        frontRef.current = slot;
        setFront(slot);
      }
    }, []);

    const handleLoad0 = useCallback(
      () => handleSlotLoad(0),
      [handleSlotLoad],
    );
    const handleLoad1 = useCallback(
      () => handleSlotLoad(1),
      [handleSlotLoad],
    );

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

    const iframeBaseStyle: React.CSSProperties = {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      border: 0,
      background: "transparent",
    };

    return (
      <div
        ref={containerRef}
        className={className}
        style={{ position: "relative", overflow: "hidden" }}
      >
        {/* Slot 0 */}
        <iframe
          ref={iframe0Ref}
          src={slotSrcs[0]}
          title={front === 0 ? title : `${title} (loading)`}
          sandbox="allow-scripts allow-same-origin"
          loading={loadImmediately ? "eager" : "lazy"}
          onLoad={handleLoad0}
          style={{
            ...iframeBaseStyle,
            zIndex: front === 0 ? 1 : 0,
            visibility: front === 0 ? "visible" : "hidden",
            pointerEvents: front === 0 && interactive ? "auto" : "none",
          }}
        />
        {/* Slot 1 */}
        <iframe
          ref={iframe1Ref}
          src={slotSrcs[1]}
          title={front === 1 ? title : `${title} (loading)`}
          sandbox="allow-scripts allow-same-origin"
          loading={loadImmediately ? "eager" : "lazy"}
          onLoad={handleLoad1}
          style={{
            ...iframeBaseStyle,
            zIndex: front === 1 ? 1 : 0,
            visibility: front === 1 ? "visible" : "hidden",
            pointerEvents: front === 1 && interactive ? "auto" : "none",
          }}
        />

        {/* Runtime error banner (only when fully loaded) */}
        {isFullyLoaded && runtimeError ? (
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

        {/* First-load overlay */}
        {!hasEverLoaded ? (
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

        {/* Subtle transition indicator for subsequent loads */}
        {hasEverLoaded && !isFullyLoaded ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
            <div className="h-0.5 animate-pulse bg-zinc-300 dark:bg-zinc-600" />
          </div>
        ) : null}
      </div>
    );
  },
);

PreviewFrameInner.displayName = "PreviewFrame";

export const PreviewFrame = memo(PreviewFrameInner);
