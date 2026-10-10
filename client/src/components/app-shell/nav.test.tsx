import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NAV, Sidebar } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

afterEach(cleanup);

describe("Eval Dashboard sidebar item (AC-22)", () => {
  it("sits in the Skills Lab group and opens /eval", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB");
    const item = lab?.items.find((i) => i.key === "eval");
    expect(item).toMatchObject({ label: "Eval Dashboard", href: "/eval" });
  });

  it("is the active key on /eval and on a per-agent eval page", () => {
    expect(activeKeyFor("/eval")).toBe("eval");
    expect(activeKeyFor("/eval/ag1")).toBe("eval");
  });

  it("is rendered as a link and highlighted while that page is open", () => {
    render(<Sidebar ctx={{ activeKey: "eval", repoId: "r1", repos: [], activeRepo: null }} />);
    const link = screen.getByRole("link", { name: /Eval Dashboard/ });
    expect(link).toHaveAttribute("href", "/eval");
    expect(link.firstElementChild).toHaveStyle({ fontWeight: "600" });
    expect(screen.getByRole("link", { name: /Agents/ }).firstElementChild).toHaveStyle({ fontWeight: "500" });
  });
});

describe("Multi-Agent Review sidebar item (AC-12)", () => {
  it("sits alone in a GLOBAL group and opens /multi-agent", () => {
    const global = NAV.find((g) => g.section === "GLOBAL");
    expect(global?.items).toHaveLength(1);
    expect(global?.items[0]).toMatchObject({
      key: "multi-agent",
      label: "Multi-Agent Review",
      href: "/multi-agent",
    });
  });

  it("is the active key on the landing, Configure run and results pages", () => {
    expect(activeKeyFor("/multi-agent")).toBe("multi-agent");
    expect(activeKeyFor("/multi-agent/configure")).toBe("multi-agent");
    expect(activeKeyFor("/multi-agent/run-1")).toBe("multi-agent");
  });

  it("is rendered as a link and highlighted while a multi-agent page is open", () => {
    render(<Sidebar ctx={{ activeKey: "multi-agent", repoId: "r1", repos: [], activeRepo: null }} />);
    const link = screen.getByRole("link", { name: /Multi-Agent Review/ });
    expect(link).toHaveAttribute("href", "/multi-agent");
    expect(link.firstElementChild).toHaveStyle({ fontWeight: "600" });
  });
});

describe("CI Runs sidebar item (AC-30)", () => {
  it("sits in the Skills Lab group and opens /ci-runs", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB");
    expect(lab?.items.find((i) => i.key === "ci-runs")).toMatchObject({ label: "CI Runs", href: "/ci-runs" });
    expect(activeKeyFor("/ci-runs")).toBe("ci-runs");
  });
});
