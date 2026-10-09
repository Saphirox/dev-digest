import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/eval.json";
import { MetricTile } from "./MetricTile";
import { RunStatusLabel } from "./RunStatusLabel";

afterEach(cleanup);

function renderIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("MetricTile", () => {
  it("NFR-6/AC-18: a drop shows a minus sign, an arrow and an accessible name", () => {
    renderIntl(<MetricTile label="Precision" value="91%" delta={-0.02} trend={[0.9, 0.93, 0.91]} />);
    expect(screen.getByText("91%")).toBeInTheDocument();
    const delta = screen.getByRole("img", { name: "Precision: down 2 points" });
    expect(delta).toHaveTextContent("−2 pt");
    expect(delta.querySelector("svg")).not.toBeNull();
  });

  it("NFR-6: a rise shows a plus sign and 'up'", () => {
    renderIntl(<MetricTile label="Recall" value="82%" delta={0.04} />);
    const delta = screen.getByRole("img", { name: "Recall: up 4 points" });
    expect(delta).toHaveTextContent("+4 pt");
  });

  it("EC-6: an unknown value is a dash and there is no delta without a previous run", () => {
    renderIntl(<MetricTile label="Recall" value="—" delta={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("AC-38: draws a sparkline from two or more points only", () => {
    const { container, rerender } = renderIntl(<MetricTile label="Recall" value="80%" trend={[0.7, 0.8]} />);
    expect(container.querySelector("svg path")).not.toBeNull();
    rerender(
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <MetricTile label="Recall" value="80%" trend={[0.8]} />
      </NextIntlClientProvider>,
    );
    expect(container.querySelector("svg path")).toBeNull();
  });
});

describe("RunStatusLabel", () => {
  it("NFR-6: every status is a word as well as an icon", () => {
    renderIntl(
      <>
        <RunStatusLabel status="running" />
        <RunStatusLabel status="done" />
        <RunStatusLabel status="failed" />
      </>,
    );
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});
