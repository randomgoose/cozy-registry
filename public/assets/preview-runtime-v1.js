/**
 * Cozy Preview Injected Runtime v1
 *
 * Standalone bridge between preview iframes and parent pages.
 * Loaded before the component bundle via <script type="module">.
 * The component bundle calls window.__cozy_render(Mod, hints, initialProps, options).
 */
import React from "react";
import { createRoot } from "react-dom/client";

const MSG_INITIAL = "cozy-preview-initial-props";
const MSG_SET = "cozy-preview-set-props";
const MSG_ERROR = "cozy-preview-runtime-error";

function isRenderable(v) {
  if (v == null) return false;
  if (typeof v === "function") return true;
  if (typeof v === "object" && "$$typeof" in v) return true;
  return false;
}

function resolveComponent(Mod, hints) {
  var tryKey = function (key) {
    if (key == null || key === "") return null;
    var v = Mod[key];
    return isRenderable(v) ? v : null;
  };

  var chain = [
    function () { return tryKey(hints.previewExport); },
    function () { return isRenderable(Mod.default) ? Mod.default : null; },
    function () { return tryKey(hints.pascal); },
    function () { return tryKey(hints.camel); },
    function () { return tryKey("PreviewComponent"); },
  ];

  for (var i = 0; i < chain.length; i++) {
    var picked = chain[i]();
    if (isRenderable(picked)) return picked;
  }

  var keys = Object.keys(Mod);
  var pascalLike = keys
    .filter(function (k) {
      return k !== "default" && k !== "__esModule" && /^[A-Z][A-Za-z0-9]*$/.test(k);
    })
    .sort();
  for (var pi = 0; pi < pascalLike.length; pi++) {
    var pv = tryKey(pascalLike[pi]);
    if (pv) return pv;
  }

  var utilityExact = { cn: 1, cx: 1, cva: 1, tv: 1, tw: 1, twMerge: 1, clsx: 1, classNames: 1 };
  var utilitySuffix = /(?:[Vv]ariants|[Pp]rops|[Ss]chema|[Cc]onfig|[Cc]ontext|[Tt]heme|[Ss]tyles?)$/;

  var rest = keys
    .filter(function (k) {
      return (
        k !== "default" &&
        k !== "__esModule" &&
        pascalLike.indexOf(k) === -1 &&
        !utilityExact[k] &&
        !utilitySuffix.test(k)
      );
    })
    .sort();
  for (var ri = 0; ri < rest.length; ri++) {
    var rv = tryKey(rest[ri]);
    if (rv) return rv;
  }

  return null;
}

function toErrorLike(error) {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  try { return new Error(JSON.stringify(error)); } catch { return new Error(String(error)); }
}

function reportToParent(payload) {
  try {
    var origin = window.location.origin;
    window.parent.postMessage(
      { type: MSG_ERROR, payload: payload },
      origin && origin !== "null" ? origin : "*",
    );
  } catch {
    try { window.parent.postMessage({ type: MSG_ERROR, payload: payload }, "*"); } catch {}
  }
}

function renderErrorOverlay(payload) {
  var existing = document.getElementById("cozy-preview-runtime-error");
  if (existing) existing.remove();
  var host = document.createElement("div");
  host.id = "cozy-preview-runtime-error";
  host.setAttribute(
    "style",
    [
      "position:fixed", "inset:0", "z-index:2147483647", "overflow:auto",
      "background:rgba(17,24,39,0.9)", "padding:24px", "box-sizing:border-box",
      "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace", "color:#f9fafb",
    ].join(";"),
  );
  var stack = payload.stack ? "\n\n" + payload.stack : "";
  var componentStack = payload.componentStack ? "\n\nComponent stack:\n" + payload.componentStack : "";
  var hint = payload.debugEnabled ? "" : "\n\nTip: reopen this preview with ?debug=1 for dev React and richer diagnostics.";
  host.innerHTML =
    '<div style="max-width:960px;margin:0 auto;border:1px solid rgba(248,113,113,0.55);background:rgba(127,29,29,0.32);border-radius:16px;padding:18px 20px;box-shadow:0 12px 30px rgba(0,0,0,0.35)">' +
    '<div style="font:600 14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin-bottom:10px;color:#fecaca">Preview runtime failed</div>' +
    '<div style="font:500 12px/1.5 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;margin-bottom:14px;color:#fca5a5">Phase: ' +
    String(payload.phase) + "</div>" +
    '<pre style="margin:0;white-space:pre-wrap;word-break:break-word;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#fff">' +
    String(payload.message || "Unknown preview runtime error") + stack + componentStack + hint + "</pre></div>";
  document.body.appendChild(host);
}

function handleRuntimeError(phase, rawError, extra, debugEnabled) {
  var error = toErrorLike(rawError);
  var payload = {
    phase: phase,
    message: error.message || String(rawError),
    stack: typeof error.stack === "string" ? error.stack : null,
    componentStack: extra && typeof extra.componentStack === "string" ? extra.componentStack : null,
    debugEnabled: !!debugEnabled,
  };
  console.error("[preview-runtime]", phase, error, extra || null);
  renderErrorOverlay(payload);
  reportToParent(payload);
}

// Global error handlers — installed once when the runtime loads
window.addEventListener("error", function (event) {
  handleRuntimeError("window-error", event.error || event.message, null, window.__cozy_debug);
});
window.addEventListener("unhandledrejection", function (event) {
  handleRuntimeError("unhandledrejection", event.reason, null, window.__cozy_debug);
});

/**
 * Main render entry point called by the component bundle.
 * @param {object} Mod - The component module (import * as Mod)
 * @param {{ previewExport?: string|null, pascal: string, camel: string }} hints
 * @param {Record<string, unknown>} initialProps
 * @param {{ mode?: "default"|"thumbnail", debug?: boolean }} options
 */
window.__cozy_render = function (Mod, hints, initialProps, options) {
  var mode = (options && options.mode) || "default";
  var debugEnabled = !!(options && options.debug);
  window.__cozy_debug = debugEnabled;
  var isThumbnail = mode === "thumbnail";
  var INITIAL_PROPS = initialProps || {};

  var Component = resolveComponent(Mod, hints);
  if (!isRenderable(Component)) {
    throw new Error("No suitable component export found from ./index for preview");
  }

  function App() {
    var ref = React.useState(INITIAL_PROPS);
    var props = ref[0];
    var setProps = ref[1];

    React.useEffect(function () {
      if (isThumbnail) return;
      function onMessage(ev) {
        if (ev.source !== window.parent) return;
        if (!ev.data || typeof ev.data !== "object") return;
        if (ev.data.type !== MSG_SET) return;
        var next = ev.data.props;
        if (!next || typeof next !== "object" || Array.isArray(next)) return;
        setProps(next);
      }
      window.addEventListener("message", onMessage);
      return function () { window.removeEventListener("message", onMessage); };
    }, []);

    React.useEffect(function () {
      if (isThumbnail) return;
      try {
        var origin = window.location.origin;
        window.parent.postMessage(
          { type: MSG_INITIAL, props: INITIAL_PROPS },
          origin && origin !== "null" ? origin : "*",
        );
      } catch {
        try { window.parent.postMessage({ type: MSG_INITIAL, props: INITIAL_PROPS }, "*"); } catch {}
      }
    }, []);

    return React.createElement(
      "div",
      {
        style: {
          width: "100%", minHeight: "100vh",
          padding: isThumbnail ? 0 : 24, boxSizing: "border-box",
          display: "flex", justifyContent: "center",
          alignItems: isThumbnail ? "flex-start" : "center",
          overflow: "hidden",
          background: isThumbnail ? "transparent" : undefined,
        },
      },
      React.createElement(
        "div",
        { "data-cozy-preview-content": true, style: { width: "100%", maxWidth: "100%", margin: "0 auto", display: "flex", justifyContent: "center" } },
        React.createElement(
          "div",
          {
            "data-cozy-preview-subject": true,
            style: {
              width: "fit-content",
              maxWidth: isThumbnail ? "none" : "100%",
              transform: isThumbnail ? "scale(1.18)" : "none",
              transformOrigin: "top center",
            },
          },
          React.createElement(Component, props),
        ),
      ),
    );
  }

  class PreviewRuntimeBoundary extends React.Component {
    constructor(p) {
      super(p);
      this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
      return { error: toErrorLike(error) };
    }
    componentDidCatch(error, info) {
      handleRuntimeError("render", error, {
        componentStack: info && typeof info.componentStack === "string" ? info.componentStack : null,
      }, debugEnabled);
    }
    render() {
      if (this.state.error) return null;
      return this.props.children;
    }
  }

  var container = document.getElementById("root");
  if (!container) throw new Error("Missing #root element for preview runtime");

  var root = createRoot(container);
  root.render(React.createElement(PreviewRuntimeBoundary, null, React.createElement(App)));
};
