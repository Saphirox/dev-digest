/* ImportSkillDrawer — import a skill from a .md file or a .zip archive in two
   steps. (1) The server parses the upload into a preview and saves nothing.
   (2) The user reads the preview (body, ignored archive members, warnings) and
   confirms; only then is the skill created, disabled, as source "imported".
   Nothing in the archive is extracted or run. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, Icon, Markdown, SectionLabel } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { useCreateSkill, useImportSkillPreview } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { SkillTypeBadge } from "../../../../components/skill-type-badge";
import { ACCEPTED_FILES } from "./constants";
import { readFileAsBase64 } from "./helpers";
import { s } from "./styles";

export function ImportSkillDrawer({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (skillId: string) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const parse = useImportSkillPreview();
  const create = useCreateSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    let content_b64: string;
    try {
      content_b64 = await readFileAsBase64(file);
    } catch {
      toast.error(t("import.readFailed"));
      return;
    }
    parse.mutate({ filename: file.name, content_b64 }, { onSuccess: setPreview });
  };

  const confirm = () => {
    if (!preview) return;
    create.mutate(
      {
        name: preview.name,
        description: preview.description,
        type: preview.type,
        body: preview.body,
        source: preview.source,
        enabled: false,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("file.success", { name: skill.name }));
          onImported(skill.id);
        },
      },
    );
  };

  const reset = () => {
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Drawer
      width={640}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        preview ? (
          <div style={s.footer}>
            <Button kind="ghost" size="sm" onClick={reset}>
              {t("import.again")}
            </Button>
            <Button kind="primary" size="sm" icon="Upload" onClick={confirm} loading={create.isPending}>
              {t("import.confirm")}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div style={s.body}>
        <div style={s.notice}>
          <strong>{t("import.trustTitle")}.</strong> {t("import.trustNotice")}
        </div>

        {!preview && (
          <label style={s.picker}>
            <Icon.Upload size={20} />
            <span>{parse.isPending ? t("import.parsing") : t("import.pick")}</span>
            <span style={s.hint}>{t("import.accept")}</span>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_FILES}
              aria-label={t("import.pick")}
              style={s.hiddenInput}
              disabled={parse.isPending}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
        )}

        {preview && (
          <>
            <SectionLabel>{t("import.previewTitle")}</SectionLabel>
            <div style={s.meta}>
              <span className="mono" style={s.name}>
                {preview.name}
              </span>
              <SkillTypeBadge type={preview.type} />
            </div>
            {preview.description && <p style={s.description}>{preview.description}</p>}
            <div style={s.markdown}>
              <Markdown>{preview.body}</Markdown>
            </div>

            {preview.warnings.length > 0 && (
              <>
                <SectionLabel>{t("import.warningsTitle")}</SectionLabel>
                {preview.warnings.map((w) => (
                  <div key={w} style={s.warning}>
                    {w}
                  </div>
                ))}
              </>
            )}

            {preview.ignored_entries.length > 0 && (
              <>
                <SectionLabel>
                  {t("import.ignoredTitle", { count: preview.ignored_entries.length })}
                </SectionLabel>
                <span style={s.hint}>{t("import.ignoredHint")}</span>
                <ul style={s.list} aria-label={t("import.ignoredTitle", { count: preview.ignored_entries.length })}>
                  {preview.ignored_entries.map((entry) => (
                    <li key={entry} className="mono">
                      {entry}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
