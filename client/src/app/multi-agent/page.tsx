/* Route: /multi-agent. Landing: nothing is selected until the user configures a run. */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";

export default function MultiAgentLandingPage() {
  const t = useTranslations("multiAgent");
  const router = useRouter();
  return (
    <AppShell crumb={[{ label: t("crumb.root") }]}>
      <EmptyState
        icon="Cpu"
        title={t("landing.title")}
        body={t("landing.body")}
        cta={t("landing.cta")}
        onCta={() => router.push("/multi-agent/configure")}
      />
    </AppShell>
  );
}
