"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import Button from "./Button";

/**
 * Promise-based dialogs — replace window.confirm() / window.prompt().
 *   if (await confirmDialog("Delete this zone?", { danger: true })) remove.mutate(id);
 *   confirmDialog({ title, message, confirmText, danger }).then((ok) => ok && doIt());
 *   const reason = await promptDialog("Reason for rejecting?", { defaultValue: "Not found" }); // null = cancelled
 * <ConfirmHost /> is mounted once in app/providers.jsx.
 */
let current = null;
let seq = 0;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

function open(o, resolve) {
  current?.resolve(current.input ? null : false); // only one at a time
  current = { ...o, resolve, id: ++seq };
  emit();
}

export function confirmDialog(message, opts = {}) {
  const o = typeof message === "object" ? message : { ...opts, message };
  return new Promise((resolve) => open(o, resolve));
}

/** Asks for a line of text. Resolves the trimmed text, or null when cancelled. */
export function promptDialog(message, opts = {}) {
  const o = typeof message === "object" ? message : { ...opts, message };
  return new Promise((resolve) => open({ ...o, input: true }, resolve));
}

function close(value) {
  current?.resolve(value);
  current = null;
  emit();
}

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function Body({ c }) {
  const [text, setText] = useState(c.defaultValue ?? "");
  const danger = c.danger ?? /delete|remove|revoke|void|archive|disable|left|cancel|refund|reject|suspend/i.test(`${c.title ?? ""} ${c.message ?? ""}`);
  const Icon = danger ? AlertTriangle : HelpCircle;
  const minLength = c.minLength ?? (c.input ? 1 : 0);
  const ok = !c.input || text.trim().length >= minLength;
  const submit = () => ok && close(c.input ? text.trim() : true);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex gap-4">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full ${danger ? "bg-rose-50 text-rose-600 dark:bg-rose-500/15" : "bg-primary-50 text-primary-600 dark:bg-primary-500/15"}`}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Dialog.Title className="font-semibold text-ink">{c.title ?? (c.input ? "Please fill in" : danger ? "Are you sure?" : "Please confirm")}</Dialog.Title>
          <Dialog.Description className="mt-1.5 whitespace-pre-line text-sm text-muted">{c.message}</Dialog.Description>
          {c.input && (
            <textarea
              data-input
              rows={2}
              maxLength={c.maxLength ?? 300}
              value={text}
              placeholder={c.placeholder ?? "Type here"}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), submit())}
              className="mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            />
          )}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" data-cancel onClick={() => close(c.input ? null : false)}>
          {c.cancelText ?? "Cancel"}
        </Button>
        <Button type="submit" disabled={!ok} variant={danger ? "danger" : "primary"}>
          {c.confirmText ?? (c.input ? "OK" : danger ? "Yes, continue" : "Confirm")}
        </Button>
      </div>
    </form>
  );
}

export function ConfirmHost() {
  const c = useSyncExternalStore(subscribe, () => current, () => null);
  return (
    <Dialog.Root open={Boolean(c)} onOpenChange={(o) => !o && close(c?.input ? null : false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] animate-fade-in bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 animate-zoom-in rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-pop)]"
          onOpenAutoFocus={(e) => {
            // text box first when asking for text, otherwise the safe button
            e.preventDefault();
            (e.currentTarget.querySelector("[data-input]") ?? e.currentTarget.querySelector("[data-cancel]"))?.focus();
          }}
        >
          {c && <Body key={c.id} c={c} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
