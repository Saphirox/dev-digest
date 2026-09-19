/* BodyEditor — a skill's markdown body as a file: header with the file name,
   an "unsaved" marker and the token estimate, then a line-numbered editor.
   Lines don't wrap, so numbers always match the file's real lines. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { MIN_LINES } from "./constants";
import { s } from "./styles";

export function BodyEditor({
  value,
  onChange,
  fileName,
  unsavedLabel,
  tokensLabel,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  fileName: string;
  /** Shown as a badge when set (the body differs from the saved one). */
  unsavedLabel?: string;
  tokensLabel: string;
  placeholder?: string;
  ariaLabel: string;
}) {
  const lines = Math.max(value.split("\n").length, MIN_LINES);
  return (
    <div style={s.frame}>
      <div style={s.header}>
        <Icon.FileText size={13} />
        <span className="mono" style={s.fileName}>
          {fileName}
        </span>
        {unsavedLabel && <span style={s.unsaved}>{unsavedLabel}</span>}
        <span style={s.tokens}>{tokensLabel}</span>
      </div>
      <div style={s.scroller}>
        <div style={s.gutter} aria-hidden>
          {Array.from({ length: value.split("\n").length }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          spellCheck={false}
          wrap="off"
          style={s.textarea(lines)}
        />
      </div>
    </div>
  );
}
