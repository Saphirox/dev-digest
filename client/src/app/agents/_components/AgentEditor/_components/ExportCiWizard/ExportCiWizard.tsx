/* ExportCiWizard — "Add to CI": Target → Preview → Configure → Install. Turns
   the agent into repository files and opens a PR (or downloads a zip). The state
   lives in useExportCiWizard; each step is a small component under _components. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ExportWizardSteps, Modal } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigureStep } from "./_components/ConfigureStep";
import { InstallStep } from "./_components/InstallStep";
import { PreviewStep } from "./_components/PreviewStep";
import { TargetStep } from "./_components/TargetStep";
import { STEP_KEYS } from "./constants";
import { useExportCiWizard } from "./useExportCiWizard";
import { s } from "./styles";

export function ExportCiWizard({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const t = useTranslations("ci.exportWizard");
  const wizard = useExportCiWizard(agent);
  const { step, stepKey } = wizard;

  const filesReady = !wizard.previewPending && !wizard.previewError && wizard.files.length > 0;
  const canContinue =
    stepKey === "target" || (stepKey === "preview" && filesReady) || (stepKey === "configure" && filesReady && wizard.triggers.length > 0);

  const footer = wizard.installed ? (
    <div style={s.footer}>
      <span style={s.spacer} />
      <Button type="button" kind="primary" onClick={onClose}>
        {t("close")}
      </Button>
    </div>
  ) : (
    <div style={s.footer}>
      {step > 0 && (
        <Button type="button" icon="ChevronLeft" onClick={() => wizard.goTo(step - 1)}>
          {t("back")}
        </Button>
      )}
      <span style={s.spacer} />
      {stepKey === "install" ? (
        <Button
          type="button"
          kind="primary"
          icon="Check"
          loading={wizard.installing}
          disabled={!wizard.repo || !filesReady}
          onClick={wizard.install}
        >
          {wizard.installing ? t("installing") : t("install")}
        </Button>
      ) : (
        <Button
          type="button"
          kind="primary"
          iconRight="ArrowRight"
          disabled={!canContinue}
          onClick={() => wizard.goTo(step + 1)}
        >
          {t("continue")}
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      width={820}
      title={t("title")}
      subtitle={t("subtitle", { agentName: agent.name })}
      onClose={onClose}
      footer={footer}
    >
      <div style={s.stepper}>
        <ExportWizardSteps step={step} labels={STEP_KEYS.map((k) => t(`steps.${k}`))} />
      </div>
      <div style={s.body}>
        {stepKey === "target" && <TargetStep />}
        {stepKey === "preview" && <PreviewStep wizard={wizard} />}
        {stepKey === "configure" && <ConfigureStep wizard={wizard} />}
        {stepKey === "install" && <InstallStep wizard={wizard} />}
      </div>
    </Modal>
  );
}
