"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MonoLink } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";
import { formatFileRef, type RefTarget } from "../../helpers";
import { s } from "./styles";

interface FileRefLinkProps {
  file: string;
  startLine?: number;
  endLine?: number;
  target: RefTarget;
  /** `owner/repo`, or `null` when unknown — a blast-only ref then renders as
   *  plain text, never as a control that does nothing. */
  repoFullName: string | null;
  /** The commit a blast-only ref is linked at. */
  sha: string;
  onOpenFile: (path: string) => void;
  /** The PR adds this file: a ref to its first line reads "new file", not
   *  `:1` — the whole file is the change. */
  newFile?: boolean;
}

/** One file reference. A PR file is a real button that opens that file on
 *  Files changed; a blast-only file is an external GitHub blob link. */
export function FileRefLink({
  file,
  startLine,
  endLine,
  target,
  repoFullName,
  sha,
  onOpenFile,
  newFile = false,
}: FileRefLinkProps) {
  const t = useTranslations("brief");
  const wholeNewFile = newFile && (startLine == null || startLine === 1);
  const text = wholeNewFile ? file : formatFileRef(file, startLine, endLine);

  if (target === "pr") {
    return (
      <span style={s.wrap}>
        <button type="button" className="mono" style={s.button} onClick={() => onOpenFile(file)}>
          {text}
        </button>
        {wholeNewFile && <span style={s.newTag}>{t("newFile")}</span>}
      </span>
    );
  }
  if (!repoFullName) {
    return (
      <span className="mono" style={s.text}>
        {text}
      </span>
    );
  }
  return <MonoLink href={githubBlobUrl(repoFullName, sha, file, startLine, endLine)}>{text}</MonoLink>;
}
