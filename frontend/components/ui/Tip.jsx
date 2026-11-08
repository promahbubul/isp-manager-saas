"use client";

import * as T from "@radix-ui/react-tooltip";

/** Styled hover/focus tooltip. With no `content` it renders the child as is. */
export function Tip({ content, children, side = "top" }) {
  if (!content) return children;
  return (
    <T.Root delayDuration={200}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs leading-snug text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          {content}
          <T.Arrow className="fill-zinc-900 dark:fill-zinc-100" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export const TipProvider = T.Provider;
