"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import clsx from "clsx";

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Options with the same group are listed together under a heading. */
  group?: string;
}

/**
 * A dropdown where several options can be ticked at once (a native <select> can only hold one).
 * Empty selection means "everything" — the trigger shows `allLabel`.
 */
export function MultiSelect({
  allLabel,
  noun,
  options,
  value,
  onChange,
}: {
  /** Trigger text when nothing is ticked, e.g. "All brands". */
  allLabel: string;
  /** Plural word for the count shown when several are ticked, e.g. "brands" → "3 brands". */
  noun: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [alignRight, setAlignRight] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const PANEL_WIDTH = 288; // keep in sync with w-72 below

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggleOpen() {
    if (!open && buttonRef.current) {
      // Open towards the left instead if the panel would run off the right edge of the screen.
      const left = buttonRef.current.getBoundingClientRect().left;
      setAlignRight(left + PANEL_WIDTH > window.innerWidth - 8);
      setQuery("");
    }
    setOpen((o) => !o);
  }

  function toggleValue(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  const summary =
    value.length === 0
      ? allLabel
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? value[0])
        : `${value.length} ${noun}`;

  const showSearch = options.length > 8;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // Keep options in their given order, but gather each group under one heading.
  const sections = useMemo(() => {
    const out: { group: string | null; items: MultiSelectOption[] }[] = [];
    for (const o of visible) {
      const g = o.group ?? null;
      const section = out.find((s) => s.group === g);
      if (section) section.items.push(o);
      else out.push({ group: g, items: [o] });
    }
    return out;
  }, [visible]);

  return (
    <div ref={rootRef} className="relative max-w-full">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={clsx(
          "relative flex max-w-full min-w-0 items-center rounded-md border bg-white py-2 pl-3 pr-9 text-left text-sm focus:outline-none focus-visible:border-bog",
          value.length > 0 ? "border-bog text-neutral-900" : "border-neutral-300 text-neutral-900"
        )}
      >
        <span className="min-w-0 max-w-[16rem] truncate">{summary}</span>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
      </button>

      {open && (
        <div
          id={panelId}
          className={clsx(
            "absolute top-full z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg",
            alignRight ? "right-0" : "left-0"
          )}
        >
          {showSearch && (
            <div className="relative border-b border-neutral-100 p-2">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-md border border-neutral-300 py-1.5 pl-8 pr-2 text-sm focus:border-bog focus:outline-none"
              />
            </div>
          )}

          <div className="max-h-72 overflow-y-auto p-1">
            {sections.length === 0 && <p className="px-3 py-2 text-sm text-neutral-400">No matches.</p>}
            {sections.map((section) => (
              <div key={section.group ?? "_"}>
                {section.group && (
                  <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{section.group}</p>
                )}
                {section.items.map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50">
                    <input
                      type="checkbox"
                      checked={value.includes(o.value)}
                      onChange={() => toggleValue(o.value)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 accent-bog"
                    />
                    <span className="min-w-0 break-words">{o.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-2 text-xs">
            <span className="text-neutral-400">{value.length === 0 ? "Nothing selected = all" : `${value.length} selected`}</span>
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={value.length === 0}
              className="font-medium text-neutral-600 underline underline-offset-2 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
