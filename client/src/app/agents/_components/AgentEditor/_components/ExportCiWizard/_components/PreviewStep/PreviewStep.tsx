"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api";
import type { ExportCiWizardState } from "../../useExportCiWizard";
import { s } from "../../styles";

/** Step 2 — the files to create; only the workflow is editable (AC-4). */
export function PreviewStep({ wizard }: { wizard: ExportCiWizardState }) {
  const t = useTranslations("ci.exportWizard");
  const { files, selected, previewPending, previewError } = wizard;

  if (previewPending) return <p style={s.hint}>{t("preview.generating")}</p>;
  if (previewError) {
    const missing = previewError instanceof ApiError && previewError.code === "runner_bundle_missing";
    return (
      <p role="alert" style={s.error}>
        {missing ? t("preview.runnerMissing") : t("preview.loadError", { message: previewError.message })}
      </p>
    );
  }

  const isWorkflow = selected?.editable === true;
  return (
    <>
      {wizard.replaced && (
        <p role="status" style={s.warn}>
          {t("workflowReplaced")}
        </p>
      )}
      <div style={s.files}>
        <div style={s.fileList}>
          <div style={{ ...s.label, padding: "6px 10px" }}>{t("preview.filesToCreate")}</div>
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              className="mono"
              style={s.fileItem(f.path === selected?.path)}
              onClick={() => wizard.selectPath(f.path)}
            >
              {f.path}
            </button>
          ))}
        </div>
        {selected && (
          <div style={s.fileView}>
            <div style={s.fileHead}>
              <span className="mono">{selected.path}</span>
              {isWorkflow && <span style={{ ...s.hint, marginLeft: "auto" }}>{t("preview.editable")}</span>}
            </div>
            {isWorkflow ? (
              <textarea
                className="mono"
                aria-label={t("preview.workflowLabel")}
                value={wizard.workflowText}
                onChange={(e) => wizard.editWorkflow(e.target.value)}
                spellCheck={false}
                style={{ ...s.fileText, whiteSpace: "pre", resize: "vertical", border: "none", outline: "none", background: "transparent", color: "var(--text-primary)", minHeight: 280 }}
              />
            ) : (
              <pre className="mono" style={s.fileText}>
                {selected.contents}
              </pre>
            )}
          </div>
        )}
      </div>
    </>
  );
}
