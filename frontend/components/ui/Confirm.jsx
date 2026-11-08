"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { useSyncExternalStore } from "react";
import Button from "./Button";

/**
 * Promise-based confirm dialog — replaces window.confirm().
 *   if (await confirmDialog("Delete this zone?", { danger: true })) remove.mutate(id);
 *   confirmDialog({ title, message, confirmText, danger }).then((ok) => ok && doIt());
 * <ConfirmHost /> is mounted once in app/providers.jsx.
 */
let current = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export function confirmDialog(message, opts = {}) {
  const o = typeof message === "object" ? message : { ...opts, message };
  return new Promise((resolve) => {
    current?.resolve(false); // only one at a time
    current = { ...o, resolve };
    emit();
  });
}

function close(ok) {
  current?.resolve(ok);
  current = null;
  emit();
}

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function ConfirmHost() {
  const c = useSyncExternalStore(subscribe, () => current, () => null);
  const danger = c?.danger ?? /delete|remove|revoke|void|archive|disable|left|cancel/i.test(`${c?.title ?? ""} ${c?.message ?? ""}`);
  const Icon = danger ? AlertTriangle : HelpCircle;
  return (
    <Dialog.Root open={Boolean(c)} onOpenChange={(open) => !open && close(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] animate-fade-in bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-zoom-in rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-pop)]"
          onOpenAutoFocus={(e) => {
            // focus the safe button first
            e.preventDefault();
            e.currentTarget.querySelector("[data-cancel]")?.focus();
          }}
        >
          <div className="flex gap-4">
            <span className={`grid size-10 shrink-0 place-items-center rounded-full ${danger ? "bg-rose-50 text-rose-600" : "bg-primary-50 text-primary-600"}`}>
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="font-semibold text-ink">{c?.title ?? (danger ? "Are you sure?" : "Please confirm")}</Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm text-muted">{c?.message}</Dialog.Description>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" data-cancel onClick={() => close(false)}>
              {c?.cancelText ?? "Cancel"}
            </Button>
            <Button variant={danger ? "danger" : "primary"} onClick={() => close(true)}>
              {c?.confirmText ?? (danger ? "Yes, continue" : "Confirm")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
