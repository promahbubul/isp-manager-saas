"use client";

import { useState } from "react";
import { Button, Checkbox, Input, Modal, Select, Textarea } from "@/components/ui";

/**
 * Small declarative form in a modal, for the many simple admin forms.
 * fields: [{ name, label, type?: "text"|"number"|"date"|"password"|"select"|"textarea"|"checkbox", options?, required?, hint?, placeholder? }]
 * onSubmit(values) must return a promise (e.g. mutation.mutateAsync); the modal closes on success.
 */
export default function QuickForm({ title, fields, initial = {}, submitLabel = "Save", onSubmit, onClose, loading }) {
  const [v, setV] = useState(() => Object.fromEntries(fields.map((f) => [f.name, initial[f.name] ?? (f.type === "checkbox" ? false : "")])));
  const set = (name, value) => setV((s) => ({ ...s, [name]: value }));

  const submit = async (e) => {
    e.preventDefault();
    const out = {};
    for (const f of fields) {
      const x = v[f.name];
      if (x === "" && !f.required) continue; // let the API apply its default
      out[f.name] = f.type === "number" ? Number(x) : x;
    }
    try {
      await onSubmit(out);
      onClose();
    } catch {
      /* the mutation already showed the error */
    }
  };

  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {fields.map((f) => {
          const common = { label: f.label, hint: f.hint, required: f.required };
          if (f.type === "select") return <Select key={f.name} {...common} value={v[f.name]} placeholder={f.placeholder} options={f.options} onChange={(e) => set(f.name, e.target.value)} />;
          if (f.type === "textarea") return <Textarea key={f.name} {...common} value={v[f.name]} onChange={(e) => set(f.name, e.target.value)} />;
          if (f.type === "checkbox") return <Checkbox key={f.name} label={f.label} hint={f.hint} checked={Boolean(v[f.name])} onChange={(e) => set(f.name, e.target.checked)} />;
          return (
            <Input
              key={f.name}
              {...common}
              type={f.type ?? "text"}
              step={f.type === "number" ? "any" : undefined}
              placeholder={f.placeholder}
              value={v[f.name]}
              onChange={(e) => set(f.name, e.target.value)}
            />
          );
        })}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
