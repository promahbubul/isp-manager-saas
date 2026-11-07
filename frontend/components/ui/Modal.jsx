"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

const WIDTH = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

/**
 * Accessible modal (Radix Dialog): centred on desktop, a bottom sheet on phones.
 * Focus is trapped, Esc and outside click close it, the page behind does not scroll.
 *   <Modal open={open} onClose={close} title="Add zone" description="..." footer={<Button/>}>...</Modal>
 */
export default function Modal({ open, onClose, title, description, children, footer, size = "md" }) {
  return (
    <Dialog.Root open={Boolean(open)} onOpenChange={(v) => !v && onClose?.()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex max-h-[92dvh] w-full flex-col bg-surface shadow-[var(--shadow-pop)] outline-none",
            // phone: bottom sheet
            "inset-x-0 bottom-0 animate-slide-up rounded-t-2xl",
            // desktop: centred dialog
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85dvh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:animate-zoom-in sm:rounded-xl",
            WIDTH[size] ?? WIDTH.md,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-300 sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold text-ink">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</Dialog.Description>}
            </div>
            <Dialog.Close className="-mr-1 cursor-pointer rounded-md p-1.5 text-muted transition hover:bg-subtle hover:text-ink" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-line bg-subtle/50 px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
