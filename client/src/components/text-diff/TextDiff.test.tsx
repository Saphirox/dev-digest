import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { TextDiff } from "./TextDiff";

afterEach(cleanup);

describe("TextDiff", () => {
  it("AC-21: marks removed and added lines as text and counts them", () => {
    render(<TextDiff from={"a\nold\nc"} to={"a\nnew\nc"} head="v6 → v7" label="Prompt diff" sameLabel="Prompt unchanged" />);
    const diff = screen.getByRole("group", { name: "Prompt diff" });
    expect(within(diff).getByText("- old")).toBeInTheDocument();
    expect(within(diff).getByText("+ new")).toBeInTheDocument();
    expect(diff).toHaveTextContent("v6 → v7 · +1 −1");
  });

  it("EC-13: identical texts show the same-label instead of an empty diff", () => {
    render(<TextDiff from="same" to="same" head="v6 → v7" label="Prompt diff" sameLabel="Prompt unchanged" />);
    expect(screen.getByText("Prompt unchanged")).toBeInTheDocument();
    expect(screen.queryByText(/^[+-] /)).not.toBeInTheDocument();
  });

  it("renders markup in a prompt as plain text", () => {
    render(<TextDiff from="" to={"<img src=x onerror=alert(1)>"} head="h" label="d" sameLabel="s" />);
    expect(screen.getByText("+ <img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});
