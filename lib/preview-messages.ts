/** postMessage types between registry preview iframe and parent (must match preview-entry runtime). */
export const PREVIEW_MSG_INITIAL_PROPS = "cozy-preview-initial-props";
export const PREVIEW_MSG_SET_PROPS = "cozy-preview-set-props";
export const PREVIEW_MSG_RUNTIME_ERROR = "cozy-preview-runtime-error";

export type PreviewInitialPropsMessage = {
  type: typeof PREVIEW_MSG_INITIAL_PROPS;
  props: Record<string, unknown>;
};

export type PreviewSetPropsMessage = {
  type: typeof PREVIEW_MSG_SET_PROPS;
  props: Record<string, unknown>;
};

export type PreviewRuntimeErrorMessage = {
  type: typeof PREVIEW_MSG_RUNTIME_ERROR;
  payload: {
    phase: "render" | "window-error" | "unhandledrejection";
    message: string;
    stack?: string | null;
    componentStack?: string | null;
    debugEnabled: boolean;
  };
};
