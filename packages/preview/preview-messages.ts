/** postMessage types between registry preview iframe and parent (must match preview-entry runtime). */
export const PREVIEW_MSG_INITIAL_PROPS = "cozy-preview-initial-props";
export const PREVIEW_MSG_SET_PROPS = "cozy-preview-set-props";

export type PreviewInitialPropsMessage = {
  type: typeof PREVIEW_MSG_INITIAL_PROPS;
  props: Record<string, unknown>;
};

export type PreviewSetPropsMessage = {
  type: typeof PREVIEW_MSG_SET_PROPS;
  props: Record<string, unknown>;
};
