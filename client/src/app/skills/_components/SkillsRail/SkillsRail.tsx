/* SkillsRail — the left column of the Skills Lab: "Add Skill" (create or
   import), search, and a card per skill. Selecting a card opens it in the
   editor, keeping the current tab. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { ImportSkillDrawer } from "../ImportSkillDrawer";
import { DeleteSkillModal } from "../DeleteSkillModal";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { SkillRailCard } from "./_components/SkillRailCard";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsRail({ activeId, tab }: { activeId?: string; tab: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [deleting, setDeleting] = React.useState<{ id: string; name: string } | null>(null);

  const open = (id: string) => router.push(`/skills/${id}?tab=${tab}`);
  const list = filterSkills(skills ?? [], search);

  return (
    <aside style={s.rail}>
      {creating && (
        <CreateSkillModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.push(`/skills/${id}?tab=config`);
          }}
        />
      )}
      {deleting && (
        <DeleteSkillModal
          skill={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            if (deleting.id === activeId) router.push("/skills");
          }}
        />
      )}
      {importing && (
        <ImportSkillDrawer
          onClose={() => setImporting(false)}
          onImported={(id) => {
            setImporting(false);
            router.push(`/skills/${id}?tab=preview`);
          }}
        />
      )}

      <div style={s.top}>
        <div style={s.titleRow}>
          <h1 style={s.title}>{t("page.heading")}</h1>
          <Dropdown
            width={250}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.create"), icon: "Edit", onClick: () => setCreating(true) },
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting(true) },
            ]}
          />
        </div>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("page.searchPlaceholder")}
            aria-label={t("page.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>

      <div style={s.list}>
        {isLoading && (
          <>
            <Skeleton height={110} />
            <Skeleton height={110} />
          </>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {skills && skills.length > 0 && list.length === 0 && <p style={s.muted}>{t("page.noMatch")}</p>}
        {list.map((sk) => (
          <SkillRailCard
            key={sk.id}
            skill={sk}
            active={sk.id === activeId}
            onOpen={() => open(sk.id)}
            onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
            onDelete={() => setDeleting({ id: sk.id, name: sk.name })}
          />
        ))}
      </div>
    </aside>
  );
}
