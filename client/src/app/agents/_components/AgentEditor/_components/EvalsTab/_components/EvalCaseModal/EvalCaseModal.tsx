/* EvalCaseModal — create a case, or edit / run an existing one. Left: name and
   the input diff (editable when new, read-only afterwards — AC-27 never changes
   it). Right: the expected output as JSON with a valid / invalid mark (Save is
   off while it does not parse, EC-20) and the latest result. The server's 422
   (bad range, file not in the diff…) shows inline under the form. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, TextInput } from "@devdigest/ui";
import type { EvalCase, EvalCaseResult, EvalExpectation } from "@devdigest/shared";
import { formatUsd } from "@/lib/format-usd";
import { useCreateEvalCase, useRunEvalCase, useUpdateEvalCase } from "@/lib/hooks/evals";
import { NEW_EXPECTATION_JSON, diffLineKind, expectationToJson, parseExpectationJson } from "./helpers";
import { s } from "./styles";

export function EvalCaseModal({
  agentId,
  agentName,
  evalCase,
  runDisabled,
  onClose,
}: {
  agentId: string;
  agentName: string;
  /** The case being edited; null for a new one. */
  evalCase: EvalCase | null;
  /** A suite run is in progress: a single-case run would be refused (EC-8). */
  runDisabled: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const tc = useTranslations("common");
  const create = useCreateEvalCase(agentId);
  const update = useUpdateEvalCase(agentId);
  const runCase = useRunEvalCase(agentId);
  const [name, setName] = React.useState(evalCase?.name ?? "");
  const [diff, setDiff] = React.useState("");
  const [json, setJson] = React.useState(evalCase ? expectationToJson(evalCase.expected_output) : NEW_EXPECTATION_JSON);

  const parsed = parseExpectationJson(json);
  const valid = parsed !== null;
  const save = evalCase ? update : create;
  const canSave = name.trim().length > 0 && valid && (evalCase !== null || diff.trim().length > 0) && !save.isPending;
  const result: EvalCaseResult | null = runCase.data ?? evalCase?.latest_result ?? null;
  const error = save.error ?? runCase.error;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || !parsed) return;
    const expected_output = parsed as unknown as EvalExpectation;
    if (evalCase) {
      update.mutate({ id: evalCase.id, patch: { name: name.trim(), expected_output } }, { onSuccess: onClose });
    } else {
      create.mutate({ name: name.trim(), input_diff: diff, expected_output }, { onSuccess: onClose });
    }
  };

  return (
    <Modal
      width={980}
      title={evalCase ? t("caseModal.title", { name: evalCase.name }) : t("caseModal.newTitle")}
      subtitle={t("caseModal.subtitle", { agent: agentName })}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div style={s.body}>
          <div style={s.col}>
            <label style={s.label} htmlFor="eval-case-name">
              {t("caseModal.nameLabel")} <span aria-hidden="true" style={{ color: "var(--crit)" }}>*</span>
            </label>
            <TextInput
              id="eval-case-name"
              mono
              value={name}
              onChange={setName}
              placeholder={t("caseModal.namePlaceholder")}
            />
            {evalCase ? (
              <span style={s.label}>{t("caseModal.diffLabel")}</span>
            ) : (
              <label style={s.label} htmlFor="eval-case-diff">
                {t("caseModal.diffLabel")}
              </label>
            )}
            {evalCase ? (
              <pre className="mono" style={s.diff} aria-label={t("caseModal.diffReadOnly")}>
                {evalCase.input_diff.split("\n").map((line, i) => (
                  <div key={i} style={s.diffLine(diffLineKind(line))}>
                    {line || " "}
                  </div>
                ))}
              </pre>
            ) : (
              <textarea
                id="eval-case-diff"
                className="mono"
                style={s.editor}
                value={diff}
                placeholder={t("caseModal.diffPlaceholder")}
                spellCheck={false}
                onChange={(e) => setDiff(e.target.value)}
              />
            )}
          </div>
          <div style={s.colRight}>
            <div style={s.labelRow}>
              <label style={s.label} htmlFor="eval-case-expected">
                {t("caseModal.expectedLabel")}
              </label>
              <span style={s.validity(valid)} role="status">
                {valid ? <Icon.Check size={12} aria-hidden="true" /> : <Icon.X size={12} aria-hidden="true" />}
                {valid ? t("caseModal.validJson") : t("caseModal.invalidJson")}
              </span>
            </div>
            <textarea
              id="eval-case-expected"
              className="mono"
              style={s.editor}
              value={json}
              spellCheck={false}
              aria-invalid={!valid}
              onChange={(e) => setJson(e.target.value)}
            />
            {evalCase && (
              <div style={s.result(result ? result.pass : null)} data-testid="case-last-result">
                {result ? (
                  <>
                    {result.pass ? <Icon.CheckCircle size={16} aria-hidden="true" /> : <Icon.XCircle size={16} aria-hidden="true" />}
                    <span>
                      <span style={s.resultStrong}>
                        {result.pass ? t("caseModal.lastPassed") : t("caseModal.lastFailed")}
                      </span>
                      {" · "}
                      {t("caseModal.resultDetail", {
                        expected: result.expected_count,
                        produced: result.produced_count,
                        duration: result.duration_ms == null ? "—" : `${(result.duration_ms / 1000).toFixed(1)}s`,
                        cost: formatUsd(result.cost_usd),
                      })}
                    </span>
                  </>
                ) : (
                  t("caseModal.neverRun")
                )}
              </div>
            )}
            {error && (
              <div role="alert" style={s.error}>
                {error.message}
              </div>
            )}
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--border)", padding: "16px 24px", background: "var(--bg-surface)" }}>
          <div style={s.footer}>
            <Button type="button" kind="secondary" onClick={onClose}>
              {tc("actions.cancel")}
            </Button>
            {evalCase && (
              <Button
                type="button"
                kind="secondary"
                icon="Play"
                loading={runCase.isPending}
                disabled={runDisabled}
                onClick={() => runCase.mutate(evalCase.id)}
              >
                {t("caseModal.runCase")}
              </Button>
            )}
            <Button type="submit" kind="primary" icon="Check" loading={save.isPending} disabled={!canSave}>
              {tc("actions.save")}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
