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
  single = false,
  compact = false,
  disabled = false,
  panelWidth = 288,
  highlightChanged = true,
  triggerClassName,
}: {
  /** Trigger text when nothing is ticked, e.g. "All brands". */
  allLabel: string;
  /** Plural word for the count shown when several are ticked, e.g. "brands" → "3 brands". */
  noun: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Pick exactly one option; choosing closes the list. Used by `SingleSelect`. */
  single?: boolean;
  /** Smaller text and padding, for controls that sit inside a card or a row. */
  compact?: boolean;
  disabled?: boolean;
  /** Width of the open list in px. */
  panelWidth?: number;
  /** In single mode: outline the button when something other than the first option is chosen. */
  highlightChanged?: boolean;
  /** Extra classes for the button, e.g. a fixed width so it doesn't resize when the choice changes. */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [alignRight, setAlignRight] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

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
      setAlignRight(left + panelWidth > window.innerWidth - 8);
      setQuery("");
    }
    setOpen((o) => !o);
  }

  function toggleValue(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  function chooseOne(v: string) {
    onChange([v]);
    setOpen(false);
    buttonRef.current?.focus();
  }

  // In single mode the first option is the default ("everything"), so only a different pick is "active".
  const isActive = single ? highlightChanged && value.length > 0 && value[0] !== options[0]?.value : value.length > 0;

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
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={clsx(
          "relative flex max-w-full min-w-0 items-center rounded-md border bg-white text-left focus:outline-none focus-visible:border-bog disabled:cursor-not-allowed disabled:opacity-50",
          compact ? "py-1 pl-2 pr-7 text-xs" : "py-2 pl-3 pr-9 text-sm",
          isActive ? "border-bog text-neutral-900" : "border-neutral-300 text-neutral-900",
          triggerClassName
        )}
      >
        <span className="min-w-0 max-w-[16rem] truncate">{summary}</span>
        <ChevronDown
          className={clsx("pointer-events-none absolute top-1/2 -translate-y-1/2 text-neutral-500", compact ? "right-2 h-3.5 w-3.5" : "right-3 h-4 w-4")}
        />
      </button>

      {open && (
        <div
          id={panelId}
          className={clsx(
            "absolute top-full z-30 mt-1 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg",
            alignRight ? "right-0" : "left-0"
          )}
          style={{ width: panelWidth }}
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
                {section.items.map((o) =>
                  single ? (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={value.includes(o.value)}
                      onClick={() => chooseOne(o.value)}
                      className={clsx(
                        "block w-full rounded-md px-2 py-1.5 text-left",
                        compact ? "text-xs" : "text-sm",
                        // No check marks: one option is always chosen (the first is "everything").
                        // The current one is simply shown highlighted.
                        value.includes(o.value) ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-800 hover:bg-neutral-50"
                      )}
                    >
                      <span className="break-words">{o.label}</span>
                    </button>
                  ) : (
                    <label key={o.value} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50">
                      <input
                        type="checkbox"
                        checked={value.includes(o.value)}
                        onChange={() => toggleValue(o.value)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 accent-bog"
                      />
                      <span className="min-w-0 break-words">{o.label}</span>
                    </label>
                  )
                )}
              </div>
            ))}
          </div>

          {!single && (
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
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A dropdown that picks exactly one option, styled like `MultiSelect` (the browser's own <select> menu
 * can't be styled). The first option is the default.
 */
export function SingleSelect({
  options,
  value,
  onChange,
  placeholder,
  compact,
  disabled,
  panelWidth,
  highlightChanged,
  triggerClassName,
}: {
  options: MultiSelectOption[];
  value: string;
  onChange: (value: string) => void;
  /**
   * Turns it into an action menu ("Swap to…", "+ Add theme…"): the button always shows this text,
   * and picking an option just reports it without becoming the displayed value.
   */
  placeholder?: string;
  compact?: boolean;
  disabled?: boolean;
  panelWidth?: number;
  /** Outline the button when something other than the first option is chosen (default true). */
  highlightChanged?: boolean;
  triggerClassName?: string;
}) {
  return (
    <MultiSelect
      single
      allLabel={placeholder ?? options[0]?.label ?? ""}
      noun=""
      options={options}
      value={placeholder ? [] : [value]}
      onChange={(v) => onChange(v[0] ?? options[0]?.value ?? "")}
      compact={compact}
      disabled={disabled}
      panelWidth={panelWidth}
      highlightChanged={placeholder ? false : highlightChanged}
      triggerClassName={triggerClassName}
    />
  );
}
