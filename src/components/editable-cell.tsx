import { useEffect, useRef, useState } from "react";

type Kind = "text" | "number" | "date" | "select";

export type EditableCellProps = {
  value: string | number | null;
  kind?: Kind;
  options?: string[];
  editable?: boolean;
  saving?: boolean;
  display?: React.ReactNode;
  className?: string;
  onSave: (v: string | null) => void;
};

/** 셀 클릭 → 입력 → Enter/포커스 아웃 저장, Esc 취소 */
export function EditableCell({ value, kind = "text", options, editable = false, saving = false, display, className = "", onSave }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const start = () => {
    if (!editable || saving) return;
    setDraft(value == null ? "" : String(value));
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    const before = value == null ? "" : String(value);
    if (next === before) return;
    onSave(next === "" ? null : next);
  };

  if (!editing) {
    return (
      <div
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        onClick={start}
        onKeyDown={(e) => { if (editable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); start(); } }}
        className={`min-h-[18px] rounded px-1 ${editable ? "cursor-text outline-dashed outline-1 outline-transparent hover:outline-primary/50" : ""} ${saving ? "opacity-50" : ""} ${className}`}
      >
        {display ?? (value == null || value === "" ? "-" : String(value))}
      </div>
    );
  }

  if (kind === "select") {
    return (
      <select
        ref={ref as React.RefObject<HTMLSelectElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
        className="w-full rounded border border-input bg-background px-1 py-0.5 text-[11px]"
      >
        <option value="">-</option>
        {(options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      type={kind === "number" ? "number" : kind === "date" ? "date" : "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") setEditing(false);
      }}
      className="w-full min-w-[70px] rounded border border-input bg-background px-1 py-0.5 text-[11px]"
    />
  );
}
