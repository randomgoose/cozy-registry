## Component Registry Preview Runtime

This document defines the v1 technical specification for the Component Registry Preview Runtime. It is the canonical reference for how components are stored, built, and rendered for preview.

---

## 1. System Goal

The system should support the following flow:

1. User / AI uploads component source (`ComponentBundle`)
2. Server builds a browser-ready preview bundle using `esbuild`
3. Browser renders the preview inside a sandboxed iframe using a shared runtime HTML

Requirements for v1:

- **React + TSX support**
- **Multi-file component support**
- **Fast preview rendering** (acceptable build + load latency)
- **Simple, robust runtime**
- **Future live-edit support** (source is always stored)

---

## 2. Component Data Schema

All components are stored as **source files**, not compiled bundles.

```ts
type ComponentBundle = {
  name: string;
  version: string;

  files: Record<string, string>;
  // example:
  // {
  //   "index.tsx": "...",
  //   "chart.tsx": "...",
  //   "tooltip.tsx": "...",
  //   "utils.ts": "..."
  // }

  dependencies?: string[];
};
```

Example:

```json
{
  "name": "chart",
  "version": "1.0.0",
  "files": {
    "index.tsx": "...",
    "chart.tsx": "...",
    "tooltip.tsx": "..."
  },
  "dependencies": ["react", "recharts"]
}
```

**Rules:**

- `files` **must include all local imports**:
  - ✅ `import { Tooltip } from "./tooltip"` → `files["tooltip.tsx"]` must exist
  - ❌ uploading only a single TSX file while it imports others is invalid
- File keys are relative paths (no absolute paths, no OS-specific separators).
- v1 assumes the **entry file** is `index.tsx` (future versions may allow an explicit entry path).

---

## 3. Upload Build Pipeline

When a component is uploaded:

`ComponentBundle`
  ↓  
Create **temporary build project**  
  ↓  
Generate **preview entry file**  
  ↓  
Bundle using **esbuild**  
  ↓  
Store **preview bundle** + **source bundle**

### 3.1 Temporary Build Project

- For each build, create a temp directory: e.g. `/tmp/preview-builds/<random-id>/`.
- Write all `bundle.files` into that directory, preserving relative paths:
  - `index.tsx` → `/tmp/.../index.tsx`
  - `chart.tsx` → `/tmp/.../chart.tsx`
  - `utils.ts` → `/tmp/.../utils.ts`
- Generate a `preview-entry.tsx` file in the same directory.

### 3.2 Preview Entry Generation

The server automatically generates a preview entry file that renders the default export of the component:

```ts
// preview-entry.tsx
import React from "react";
import { createRoot } from "react-dom/client";

import Component from "./index";

function App() {
  return (
    <div style={{ padding: 24 }}>
      <Component />
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
```

v1 convention:

- Previewed component must be exported as a **default export** from `index.tsx`, e.g. `export default function MyComponent() { ... }`.

---

## 4. Server Build (esbuild)

The server uses `esbuild` to build a browser-ready ESM bundle:

```ts
import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["preview-entry.tsx"],
  bundle: true,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  outfile: "preview.js",

  target: ["es2018"],
  sourcemap: false,

  // v1 strategy: externalize only React/ReactDOM, bundle everything else.
  external: ["react", "react-dom", "react-dom/client"]
});
```

v1 dependency strategy:

- **React / ReactDOM**:
  - Marked as `external`.
  - Provided by the preview runtime HTML via import map + CDN.
- **All other npm dependencies** (e.g. `recharts`, `lucide-react`):
  - Bundled into `preview.js`.
  - No CDN or extra runtime configuration needed for them.

Build failures (e.g. missing files, syntax errors) must:

- Abort preview bundle generation.
- Return a structured error payload (message, file, line, column) to the caller.

---

## 5. Bundle Storage

Preview bundles are stored using **component name + version** as the key.

Example paths:

- Preview bundle: `/registry/<name>/<version>/preview.js`
- Optional metadata / source bundle: `/registry/<name>/<version>/bundle.json`

Rules:

- `version` must be **immutable**:
  - Once `/registry/chart/1.0.0/preview.js` is successfully written, it must not be overwritten.
  - Updating a component requires a new version (e.g. `1.0.1`).
- Recommended HTTP cache headers for `preview.js`:
  - `Cache-Control: public, max-age=31536000, immutable`

---

## 6. Preview API & Routing

Define a runtime HTML route, for example:

- `GET /preview-runtime?component=<name>@<version>`

Parsing:

- `component` is in the form `<name>@<version>`, e.g. `chart@1.0.0`.

The server must:

- Validate that the component and version exist.
- Check that the corresponding `preview.js` exists.
- On missing bundle, return a 404 HTML page with a human-readable error.

---

## 7. Preview Runtime (Browser)

The preview is rendered inside an iframe:

```html
<iframe
  src="/preview-runtime?component=chart@1.0.0"
  sandbox="allow-scripts"
  style="width: 100%; height: 100%; border: none;"
></iframe>
```

Security:

- Use at least `sandbox="allow-scripts"` to prevent:
  - Access to `parent` window.
  - Top-level navigation.

Additional sandbox flags (e.g. `allow-same-origin`) are optional and can be added based on product needs.

---

## 8. Preview Runtime HTML

The runtime HTML returned by `/preview-runtime` is responsible for:

- Providing React runtime (via import map + CDN ESM).
- Providing Tailwind CSS.
- Importing the component’s `preview.js` bundle.
- Rendering the component inside an error boundary.

Simplified example:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Component Preview</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <script src="https://cdn.tailwindcss.com"></script>

    <script type="importmap">
      {
        "imports": {
          "react": "https://esm.sh/react@18",
          "react-dom": "https://esm.sh/react-dom@18",
          "react-dom/client": "https://esm.sh/react-dom@18/client"
        }
      }
    </script>
  </head>
  <body class="min-h-screen bg-white">
    <div id="root"></div>

    <script type="module">
      import React from "react";
      import { createRoot } from "react-dom/client";

      // This URL is injected by the server, e.g. `/registry/chart/1.0.0/preview.js`.
      import Component from "/registry/<name>/<version>/preview.js";

      class ErrorBoundary extends React.Component {
        constructor(props) {
          super(props);
          this.state = { error: null };
        }
        static getDerivedStateFromError(error) {
          return { error };
        }
        render() {
          if (this.state.error) {
            return React.createElement(
              "pre",
              {
                style: {
                  padding: 16,
                  fontFamily:
                    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", monospace',
                  whiteSpace: "pre-wrap",
                  background: "#fef2f2",
                  color: "#b91c1c",
                  border: "1px solid #fecaca",
                  borderRadius: 8
                }
              },
              String(this.state.error)
            );
          }
          return this.props.children;
        }
      }

      const rootEl = document.getElementById("root");
      const root = createRoot(rootEl);

      root.render(
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement(Component, null)
        )
      );
    </script>
  </body>
  </html>
```

---

## 9. Error Handling

### 9.1 Build-Time Errors

When `esbuild` fails (e.g. missing file, TS/JS syntax error):

- Do **not** write `preview.js`.
- Return a structured error to the caller, e.g.:

```json
{
  "error": {
    "message": "Cannot find module './tooltip'",
    "file": "chart.tsx",
    "line": 12,
    "column": 16
  }
}
```

The UI or MCP caller should show this error to the user.

### 9.2 Load / Runtime Errors

The preview runtime must handle:

- **Network / 404 errors** for `preview.js`:
  - Show a simple error message in the iframe when the import fails.
- **Runtime errors during render**:
  - Captured by the `ErrorBoundary`, displayed as a `<pre>` with readable text.
- (Optional) Global fallbacks:
  - Handle `window.onerror` and `unhandledrejection` and render them in a similar styled block.

---

## 10. Dependency Rules

### 10.1 Local Imports

- All relative imports (e.g. `./tooltip`, `../utils`) must resolve within `files`.
- `esbuild` handles resolution of `.ts` / `.tsx` extensions.
- If a local import cannot be resolved, the build fails with a clear error.

### 10.2 External Dependencies (v1 Strategy)

- Local project code **must not** depend on app-specific aliases (e.g. `@/lib/*`) in preview bundles; all imports must be:
  - Relative (`./`, `../`), or
  - Package imports present in `dependencies`.

Handling rules:

- **React / ReactDOM**:
  - Always `external` in `esbuild` config.
  - Provided by runtime via import map:
    - `"react"` → `https://esm.sh/react@18`
    - `"react-dom"` → `https://esm.sh/react-dom@18`
    - `"react-dom/client"` → `https://esm.sh/react-dom@18/client`
- **Other dependencies** (e.g. `recharts`, `lucide-react`, `date-fns`):
  - Bundled into `preview.js` by default.
  - No additional runtime configuration is required for them.

Future versions may optionally externalize more libraries and load them from a CDN, but that is out of scope for v1.

---

## 11. Security

Security guarantees for the preview system:

- All preview code runs inside an iframe with at least:

  ```html
  <iframe sandbox="allow-scripts"></iframe>
  ```

- This prevents:
  - Access to the parent window.
  - Top-level navigation.
  - Certain forms of global pollution.

Future hardening options (not required for v1, but recommended longer term):

- Add CSP headers limiting `script-src`, `connect-src`, `img-src`, etc.
- Consider timeouts or reload behaviour for long-running or hanging components.

---

## 12. Live Editing Compatibility

To support future live editing:

- The system must **always store `ComponentBundle` source files** in addition to the built bundle.
- The build pipeline should be idempotent and re-runnable when the user edits code.

Future editor flow:

1. Editor (browser) sends updated `ComponentBundle` to the server.
2. Server runs the same `esbuild` pipeline to produce a new `preview.js`.
3. The preview iframe reloads `/preview-runtime?component=<name>@<version-or-hash>`.

No browser-side bundler is required for v1; all bundling remains on the server.

---

## 13. Tech Stack & Complexity

Server:

- Node.js
- `esbuild`
- Filesystem / object storage for:
  - Source bundles (`ComponentBundle`)
  - Preview bundles (`preview.js`)

Browser:

- React 18 runtime via CDN ESM + import map
- Iframe-based preview runtime
- Tailwind via CDN (for basic styling)

Estimated complexity:

- Upload API: **low**
- Build pipeline: **medium**
- Preview runtime: **low**
- Component storage: **low**

Overall system complexity: **medium**, with clear module boundaries and a straightforward evolution path.

