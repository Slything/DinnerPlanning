"use client";

import { X } from "lucide-react";

export function Modal({
  open,
  title,
  eyebrow,
  onClose,
  children,
  wide = false
}: {
  open: boolean;
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal-sheet ${wide ? "modal-sheet-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-handle" />
        <header className="modal-header">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>
        <div className="modal-content">{children}</div>
      </section>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-mark">G</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented-control">
      {options.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? "active" : ""}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({
  name,
  color,
  imageUrl,
  small = false
}: {
  name: string;
  color: string;
  imageUrl?: string;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar ${small ? "avatar-small" : ""} ${
        imageUrl ? "avatar-image" : ""
      }`}
      style={{ background: color }}
      title={name}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
