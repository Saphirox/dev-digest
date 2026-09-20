/* CreateSkillFromConventionsModal — the accepted conventions merged into one
   skill draft (built by the server, named `repo-conventions`), fully editable
   before saving. Saving goes through POST /skills as an `extracted` skill and,
   when an agent is picked, links it to that agent (enabled, last in its prompt). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, Modal, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { ConventionSkillDraft, SkillType } from "@devdigest/shared";
import { BodyEditor, markdownFileName } from "@/components/body-editor";
import { SKILL_TYPES } from "@/components/skill-type-badge";
import { approxTokens } from "@/lib/approx-tokens";
import { useAgents } from "@/lib/hooks/agents";
import { useCreateSkill, useLinkSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

export function CreateSkillFromConventionsModal({
  draft,
  repoName,
  onClose,
}: {
  draft: ConventionSkillDraft;
  repoName: string;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const ts = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const link = useLinkSkill();
  const { data: agents } = useAgents();
  const [agentId, setAgentId] = React.useState("");
  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [type, setType] = React.useState<SkillType>(draft.type);
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(draft.body);
  const valid = name.trim() !== "" && body.trim() !== "";

  const save = () =>
    create.mutate(
      { name: name.trim(), description: description.trim(), type, body, source: "extracted", enabled },
      {
        onSuccess: (skill) => {
          const agent = agents?.find((a) => a.id === agentId);
          if (!agent) {
            toast.success(t("modal.created", { name: skill.name }));
            onClose();
            return;
          }
          link.mutate(
            { agentId: agent.id, skillId: skill.id },
            {
              onSuccess: () => toast.success(t("modal.createdLinked", { name: skill.name, agent: agent.name })),
              // The skill exists either way; a failed link is reported by the global error toast.
              onSettled: onClose,
            },
          );
        },
      },
    );

  return (
    <Modal
      width={760}
      title={t("modal.title")}
      subtitle={name || draft.name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            <Icon.GitCommit size={13} />
            {t("modal.footer")}
          </span>
          <Button kind="secondary" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={save} disabled={!valid} loading={create.isPending || link.isPending}>
            {t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          <Icon.Edit size={14} style={s.bannerIcon} />
          <span>
            {t.rich("modal.banner", {
              count: draft.convention_count,
              repo: repoName,
              b: (chunks) => <strong>{chunks}</strong>,
              accent: (chunks) => (
                <span className="mono" style={s.repo}>
                  {chunks}
                </span>
              ),
            })}
          </span>
        </div>
        <FormField label={ts("form.nameLabel")} required>
          <TextInput value={name} onChange={setName} aria-label={ts("form.nameLabel")} mono />
        </FormField>
        <FormField label={ts("form.descriptionLabel")}>
          <TextInput value={description} onChange={setDescription} aria-label={ts("form.descriptionLabel")} />
        </FormField>
        <div style={s.row}>
          <FormField label={ts("form.typeLabel")}>
            <SelectInput
              value={type}
              onChange={(v) => setType(v as SkillType)}
              options={SKILL_TYPES.map((ty) => ({ value: ty, label: ts(`listItem.type.${ty}`) }))}
            />
          </FormField>
          <FormField label={t("modal.enabled")}>
            <Toggle on={enabled} onChange={setEnabled} />
            <div style={s.enabledHint}>{t("modal.enabledHint")}</div>
          </FormField>
        </div>
        <FormField label={t("modal.agentLabel")} hint={t("modal.agentHint")}>
          <SelectInput
            value={agentId}
            onChange={setAgentId}
            options={[
              { value: "", label: t("modal.agentNone") },
              ...(agents ?? []).map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </FormField>
        <FormField label={ts("editor.config.bodyLabel")} required>
          <BodyEditor
            value={body}
            onChange={setBody}
            fileName={markdownFileName(name)}
            unsavedLabel={ts("editor.config.unsaved")}
            tokensLabel={ts("editor.config.tokens", { count: approxTokens(body) })}
            ariaLabel={ts("editor.config.bodyLabel")}
          />
        </FormField>
      </div>
    </Modal>
  );
}
