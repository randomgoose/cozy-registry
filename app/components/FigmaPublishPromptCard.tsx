"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { CozyLogoIcon } from "@/app/components/icons/CozyLogoIcon";

const PROMPT_TEXT = "@Cozy Registry Publish the component.";

export function FigmaPublishPromptCard() {
  const [isHovered, setIsHovered] = useState(false);
  const [typedLength, setTypedLength] = useState(0);

  useEffect(() => {
    if (!isHovered) {
      return;
    }

    if (typedLength >= PROMPT_TEXT.length) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setTypedLength((current) => Math.min(current + 1, PROMPT_TEXT.length));
    }, typedLength === 0 ? 120 : 38);

    return () => window.clearTimeout(timeout);
  }, [isHovered, typedLength]);

  const promptText = useMemo(() => PROMPT_TEXT.slice(0, typedLength), [typedLength]);

  return (
    <motion.div
      onHoverStart={() => {
        setTypedLength(0);
        setIsHovered(true);
      }}
      onHoverEnd={() => {
        setIsHovered(false);
        setTypedLength(0);
      }}
      animate={{
        filter: isHovered ? "grayscale(0)" : "grayscale(1)",
      }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="group relative mx-auto aspect-[39/16] max-w-[468px] overflow-hidden rounded-[20px] border border-zinc-200 bg-[#f3f2ef] p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.5),transparent_55%)] dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_55%)]" />

      <div className="relative flex h-full flex-col text-zinc-500 dark:text-zinc-400">
        <div className="inline-flex h-[26px] w-fit items-center gap-2 rounded-sm border border-zinc-300/80 bg-white/80 px-2.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-950/80">
          <div className="overflow-hidden rounded-[1px]">
            <CozyLogoIcon className="size-4" />
          </div>
          <span className="font-medium leading-none">Cozy Registry</span>
          <svg width="16" height="16" fill="none" viewBox="0 0 16 16" className="size-4" data-fpl-icon-size="16"><path fill="currentColor" fill-rule="evenodd" d="M11.146 4.146a.5.5 0 0 1 .707.707L8.708 8l3.146 3.146a.5.5 0 0 1-.707.707L8 8.708l-3.147 3.146a.5.5 0 0 1-.707-.707L7.293 8 4.146 4.853a.5.5 0 1 1 .707-.707L8 7.293z" clip-rule="evenodd"></path></svg>
        </div>

        <div className="mt-3 max-w-[88%] text-[13px] leading-tight tracking-tight text-zinc-400 dark:text-zinc-500">
          <span className={isHovered ? "text-zinc-800 dark:text-zinc-100" : ""}>
            {promptText || "\u00A0"}
          </span>
          <motion.span
            animate={{ opacity: isHovered ? [1, 0.2, 1] : 0.4 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
            className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-zinc-500 align-baseline dark:bg-zinc-300"
          />
        </div>

        <div className="mt-auto flex items-end justify-between pt-8">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <path
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 6a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 12 6"
              />
            </svg>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <path
                fill="currentColor"
                d="M15.25 6a5.35 5.35 0 0 1 2.661.69 4.8 4.8 0 0 1 .883.646l.05.05.016.017.008.008-.368.339.368-.338A.5.5 0 0 1 19 7.75v9.5a.5.5 0 0 1-.868.338v.002l-.032-.033a3 3 0 0 0-.132-.118 4 4 0 0 0-.552-.38 4.35 4.35 0 0 0-2.166-.559c-.949 0-1.677.281-2.166.56-.245.139-.43.277-.552.379q-.09.076-.132.118l-.033.033v-.001h.001v-.001a.5.5 0 0 1-.736 0v.002l-.032-.033a3 3 0 0 0-.132-.118 4 4 0 0 0-.552-.38A4.35 4.35 0 0 0 8.75 16.5a4.34 4.34 0 0 0-2.166.56c-.245.139-.43.277-.552.379a2 2 0 0 0-.132.118l-.033.033v-.001h.001v-.001A.5.5 0 0 1 5 17.25v-9.5a.5.5 0 0 1 .132-.338l.368.338-.368-.339.008-.008.015-.016.051-.051q.065-.064.186-.165a5 5 0 0 1 .697-.48A5.35 5.35 0 0 1 8.75 6a5.35 5.35 0 0 1 2.661.69c.241.138.438.275.589.393.15-.118.348-.255.589-.393A5.35 5.35 0 0 1 15.25 6m-6.5 1a4.34 4.34 0 0 0-2.166.56c-.245.139-.43.277-.552.378L6 7.967v8.276l.089-.053a5.35 5.35 0 0 1 2.661-.69 5.35 5.35 0 0 1 2.661.69l.089.053V7.967l-.032-.029a4 4 0 0 0-.552-.378A4.35 4.35 0 0 0 8.75 7m6.5 0c-.949 0-1.677.281-2.166.56-.245.139-.43.277-.552.378l-.032.029v8.276l.089-.053a5.35 5.35 0 0 1 2.661-.69 5.35 5.35 0 0 1 2.661.69l.089.053V7.967l-.032-.029a4 4 0 0 0-.552-.378A4.35 4.35 0 0 0 15.25 7"
              />
            </svg>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="shrink-0 opacity-50"
            >
              <path
                fill="currentColor"
                d="M11.293 11.293a1 1 0 0 1 1.059-.23l8 3 .146.07a1 1 0 0 1-.102 1.785l-.154.052-3.418.854-.854 3.418a1 1 0 0 1-1.906.11l-3-8a1 1 0 0 1 .23-1.06m-2.11 5.968a.49.49 0 0 1 .642-.25c.248.103.385.386.282.634L9.16 19.93a.5.5 0 0 1-.923-.384zM15 20l1-4 4-1-8-3zm-8.782-6.242c.248-.103.53.032.634.28a.49.49 0 0 1-.25.643l-2.282.946a.5.5 0 0 1-.382-.924zm-2.552-5.25a.5.5 0 0 1 .654-.27l2.279.944a.49.49 0 0 1 .25.643c-.104.248-.386.383-.634.28l-2.278-.943a.5.5 0 0 1-.27-.653m15.88-.27a.5.5 0 0 1 .382.924l-2.28.944c-.248.103-.53-.033-.634-.28a.49.49 0 0 1 .25-.644zM8.508 3.668a.5.5 0 0 1 .653.27l.943 2.277c.102.248-.033.53-.28.633a.49.49 0 0 1-.643-.25L8.238 4.32a.5.5 0 0 1 .271-.653m6.193.27a.5.5 0 0 1 .924.382l-.944 2.278a.49.49 0 0 1-.643.25c-.248-.103-.383-.385-.28-.633z"
              />
            </svg>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Default
              </span>
              <svg width="16" height="16" fill="none" viewBox="0 0 16 16" className="size-4" data-fpl-icon-size="16"><path fill="currentColor" d="M9.768 6.768a.5.5 0 0 1 .707.707l-2.12 2.121a.5.5 0 0 1-.708 0L5.525 7.475a.5.5 0 0 1 .708-.707l1.768 1.767z"></path></svg>
            </div>
            <motion.div
              animate={isHovered ? { scale: 1.03 } : { scale: 1 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="flex size-6 items-center justify-center rounded-full bg-[#3d38f5] text-white shadow-[0_10px_24px_rgba(24,24,27,0.12)] dark:bg-[#3d38f5]"
            >
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" className="size-6"><path fill="currentColor" d="M11.725 5.582a.5.5 0 0 1 .629.064l4.5 4.5a.5.5 0 1 1-.707.707L12.5 7.208V18a.5.5 0 0 1-1 0V7.207l-3.646 3.647a.5.5 0 1 1-.708-.707l4.5-4.5z"></path></svg>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
