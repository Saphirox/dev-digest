/**
 * BriefRisks — AC-15: the severity icon's colour follows the risk severity
 * (high/medium/low reuse the CRITICAL/WARNING/SUGGESTION tokens).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { SEV } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import briefMessages from "../../../../../../../../../../messages/en/brief.json";
import { BriefRisks } from "./BriefRisks";

afterEach(cleanup);

const risk = (severity: Risk["severity"], title: string): Risk => ({
  kind: "other",
  title,
  explanation: "x",
  severity,
  file_refs: [],
}) as Risk;

describe("BriefRisks", () => {
  it("AC-15: colours each risk's severity icon by its severity, distinct across high/medium/low", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ brief: briefMessages }}>
        <BriefRisks
          risks={[risk("high", "A"), risk("medium", "B"), risk("low", "C")]}
          prPaths={new Set()}
          repoFullName={null}
          sha="abc"
          onOpenFile={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    const high = screen.getByRole("img", { name: "High risk" });
    const medium = screen.getByRole("img", { name: "Medium risk" });
    const low = screen.getByRole("img", { name: "Low risk" });

    expect(high).toHaveStyle({ color: SEV.CRITICAL.c });
    expect(medium).toHaveStyle({ color: SEV.WARNING.c });
    expect(low).toHaveStyle({ color: SEV.SUGGESTION.c });
    expect(new Set([high.style.color, medium.style.color, low.style.color]).size).toBe(3);
  });
});
