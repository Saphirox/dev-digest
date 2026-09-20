/* VersionsTab — the skill's body history, newest first. Each save that changes
   the text records one; toggling Enabled doesn't. A past version can be read,
   diffed against the current body, or restored (which saves it as a new
   version, so history is never rewritten). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { diffStats, lineDiff } from "./helpers";
import { s } from "./styles";

type View = "body" | "diff";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const { data: versions, isLoading } = useSkillVersions(skill.id);
  const [open, setOpen] = React.useState<{ version: number; view: View } | null>(null);

  const toggle = (version: number, view: View) =>
    setOpen((cur) => (cur?.version === version && cur.view === view ? null : { version, view }));

  const restore = (v: SkillVersion) =>
    update.mutate(
      { id: skill.id, patch: { body: v.body } },
      {
        onSuccess: (saved) => {
          setOpen(null);
          toast.success(t("editor.versions.restored", { from: v.version, version: saved.version }));
        },
      },
    );

  return (
    <div>
      <h2 style={s.title}>{t("editor.versions.title")}</h2>
      <p style={s.hint}>{t("editor.versions.hint")}</p>
      {isLoading && <Skeleton height={80} />}
      {versions && versions.length === 0 && <p style={s.hint}>{t("editor.versions.empty")}</p>}
      <div style={s.list}>
        {versions?.map((v) => {
          const current = v.version === skill.version;
          const view = open?.version === v.version ? open.view : current && open === null ? "body" : null;
          return (
            <div key={v.version} style={s.item} data-testid={`version-${v.version}`}>
              <div style={s.summary}>
                <Badge icon="GitCommit" mono>
                  {t("preview.version", { version: v.version })}
                </Badge>
                {current && (
                  <Badge color="var(--accent)" bg="var(--accent-bg)">
                    {t("editor.versions.current")}
                  </Badge>
                )}
                <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
                <Button type="button" kind="tertiary" size="sm" icon="Eye" active={view === "body"} onClick={() => toggle(v.version, "body")}>
                  {t("editor.versions.view")}
                </Button>
                {!current && (
                  <>
                    <Button type="button" kind="tertiary" size="sm" icon="GitBranch" active={view === "diff"} onClick={() => toggle(v.version, "diff")}>
                      {t("editor.versions.diff")}
                    </Button>
                    <Button type="button" kind="secondary" size="sm" icon="History" onClick={() => restore(v)} loading={update.isPending && update.variables?.patch.body === v.body}>
                      {t("editor.versions.restore")}
                    </Button>
                  </>
                )}
              </div>
              {view === "body" && (
                <pre className="mono" style={s.body}>
                  {v.body}
                </pre>
              )}
              {view === "diff" && <VersionDiff from={v.body} to={skill.body} version={v.version} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VersionDiff({ from, to, version }: { from: string; to: string; version: number }) {
  const t = useTranslations("skills");
  const lines = lineDiff(from, to);
  const { added, removed } = diffStats(lines);
  return (
    <div style={s.diff} aria-label={t("editor.versions.diffLabel", { version })}>
      <div style={s.diffHead}>
        {t("editor.versions.diffHead", { version })} · <span style={s.add}>+{added}</span>{" "}
        <span style={s.del}>−{removed}</span>
      </div>
      {added + removed === 0 ? (
        <div style={s.diffSame}>{t("editor.versions.noChanges")}</div>
      ) : (
        <pre className="mono" style={s.diffBody}>
          {lines.map((l, i) => (
            <div key={i} data-kind={l.kind} style={s.diffLine(l.kind)}>
              {l.kind === "add" ? "+ " : l.kind === "del" ? "- " : "  "}
              {l.text}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
