"use client";

import type { PropField } from "@/lib/validate-tsx";
import {
  getControllablePropMeta,
  type ControllablePropMeta,
} from "@/lib/preview-prop-controls";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function rowForField(
  field: PropField,
  meta: ControllablePropMeta,
  value: unknown,
  onChange: (name: string, value: unknown) => void,
) {
  const id = `preview-prop-${field.name}`;
  const label = (
    <label
      htmlFor={id}
      className="block truncate text-[11px] font-medium text-on-inverse-muted-fg"
      title={field.name}
    >
      {field.name}
      {field.optional ? (
        <span className="ml-0.5 font-normal text-on-inverse-muted-fg/80">?</span>
      ) : null}
    </label>
  );

  if (meta.kind === "boolean") {
    const checked = Boolean(value);
    return (
      <div key={field.name} className="flex items-center justify-between gap-2 py-1">
        {label}
        <input
          id={id}
          type="checkbox"
          className="h-4 w-4 rounded border-on-inverse-border bg-on-inverse-surface text-on-inverse-fg accent-white focus-visible:ring-2 focus-visible:ring-on-inverse-ring/40"
          checked={checked}
          onChange={(e) => onChange(field.name, e.target.checked)}
        />
      </div>
    );
  }

  if (meta.kind === "number") {
    const n = typeof value === "number" && !Number.isNaN(value) ? value : "";
    return (
      <div key={field.name} className="space-y-0.5 py-1">
        {label}
        <Input
          id={id}
          variant="fill"
          onInverse
          type="number"
          className="text-xs"
          value={n === "" ? "" : String(n)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "" || raw === "-") {
              onChange(field.name, 0);
              return;
            }
            const parsed = Number(raw);
            onChange(field.name, Number.isNaN(parsed) ? 0 : parsed);
          }}
        />
      </div>
    );
  }

  if (meta.kind === "enum" && meta.enumOptions?.length) {
    const v = value == null ? "" : String(value);
    const current = meta.enumOptions.includes(v) ? v : meta.enumOptions[0]!;
    const labelId = `${id}-label`;

    if (meta.enumOptions.length === 2) {
      const [a, b] = meta.enumOptions;
      return (
        <div key={field.name} className="space-y-0.5 py-1">
          <span id={labelId} className="block truncate text-[11px] font-medium text-on-inverse-muted-fg" title={field.name}>
            {field.name}
            {field.optional ? (
              <span className="ml-0.5 font-normal text-on-inverse-muted-fg/80">?</span>
            ) : null}
          </span>
          <div
            role="radiogroup"
            aria-labelledby={labelId}
            className="flex rounded-lg border border-on-inverse-border bg-on-inverse-surface/80 p-0.5"
          >
            {[a, b].map((opt) => {
              const selected = current === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`min-h-7 flex-1 truncate rounded-md px-2 py-1 text-center text-[11px] font-medium transition-colors ${
                    selected
                      ? "bg-on-inverse-fg text-zinc-950 shadow-sm"
                      : "text-on-inverse-muted-fg hover:text-on-inverse-fg"
                  }`}
                  title={opt}
                  onClick={() => onChange(field.name, opt)}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div key={field.name} className="space-y-0.5 py-1">
        <label
          htmlFor={id}
          className="block truncate text-[11px] font-medium text-on-inverse-muted-fg"
          title={field.name}
        >
          {field.name}
          {field.optional ? (
            <span className="ml-0.5 font-normal text-on-inverse-muted-fg/80">?</span>
          ) : null}
        </label>
        <Select
          key={`${field.name}-${meta.enumOptions.join("|")}`}
          onInverse
          value={current}
          onValueChange={(v) => {
            if (v != null) onChange(field.name, v);
          }}
        >
          <SelectTrigger variant="fill" id={id} size="sm" className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {meta.enumOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const str = value == null ? "" : String(value);
  return (
    <div key={field.name} className="space-y-0.5 py-1">
      {label}
      <Input
        id={id}
        variant="fill"
        onInverse
        type="text"
        className="text-xs"
        value={str}
        onChange={(e) => onChange(field.name, e.target.value)}
      />
    </div>
  );
}

export function PreviewPropsDebugPanel(props: {
  fields: PropField[];
  values: Record<string, unknown> | null;
  onChange: (name: string, value: unknown) => void;
}) {
  const { fields, values, onChange } = props;

  const rows = fields
    .map((field) => {
      const meta = getControllablePropMeta(field);
      if (!meta) return null;
      return { field, meta };
    })
    .filter((x): x is { field: PropField; meta: ControllablePropMeta } => x != null);

  if (rows.length === 0) return null;

  if (!values) {
    return (
      <div className="pointer-events-auto absolute right-3 top-3 z-20 w-[min(100%-1.5rem,220px)] rounded-xl border border-white/20 bg-zinc-950/90 p-3 text-xs text-on-inverse-muted-fg shadow-lg backdrop-blur-md dark:bg-zinc-950/92">
        <p className="font-medium text-on-inverse-fg">Props 调试</p>
        <p className="mt-2 leading-relaxed">等待预览加载完成后可调整…</p>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-auto absolute right-3 top-3 z-20 max-h-[min(70dvh,420px)] w-[min(100%-1.5rem,240px)] overflow-y-auto overscroll-contain rounded-xl border border-white/20 bg-zinc-950/90 p-3 shadow-lg backdrop-blur-md dark:border-zinc-700/80 dark:bg-zinc-950/92"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-on-inverse-muted-fg">
        Props 调试
      </p>
      <div className="divide-y divide-on-inverse-border/60">
        {rows.map(({ field, meta }) =>
          rowForField(field, meta, values[field.name], onChange),
        )}
      </div>
    </div>
  );
}
