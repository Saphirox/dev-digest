import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../lib/toast";

const parseMutate = vi.fn();
const createMutate = vi.fn();

vi.mock("../../../../lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutate: parseMutate, isPending: false }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
}));

import { ImportSkillDrawer } from "./ImportSkillDrawer";

const PREVIEW: SkillImportPreview = {
  name: "semver-discipline",
  description: "Use when a PR changes a public API.",
  type: "convention",
  body: "Bump the major version on breaking changes.",
  source: "imported_url",
  ignored_entries: ["semver/README.md", "semver/install.sh"],
  warnings: ["Ignored 1 executable-looking file(s), never run: semver/install.sh"],
};

function renderDrawer() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ImportSkillDrawer onClose={() => {}} onImported={() => {}} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

async function pickFile() {
  const file = new File(["zip-bytes"], "semver.zip", { type: "application/zip" });
  fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [file] } });
  await waitFor(() => expect(parseMutate).toHaveBeenCalled());
}

beforeEach(() => {
  parseMutate.mockReset();
  createMutate.mockReset();
  parseMutate.mockImplementation((_req, opts) => opts.onSuccess(PREVIEW));
});
afterEach(cleanup);

describe("ImportSkillDrawer", () => {
  it("sends the file as base64 and shows the preview without saving anything", async () => {
    renderDrawer();
    await pickFile();
    const [req] = parseMutate.mock.calls[0]!;
    expect(req.filename).toBe("semver.zip");
    expect(atob(req.content_b64)).toBe("zip-bytes");

    expect(await screen.findByText("semver-discipline")).toBeInTheDocument();
    expect(screen.getByText("Bump the major version on breaking changes.")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("lists ignored archive members and the executable warning", async () => {
    renderDrawer();
    await pickFile();
    expect(await screen.findByText("Not imported (2)")).toBeInTheDocument();
    expect(screen.getByText("semver/install.sh")).toBeInTheDocument();
    expect(screen.getByText(/never run: semver\/install\.sh/)).toBeInTheDocument();
  });

  it("creates the skill disabled, as imported, only on confirm", async () => {
    renderDrawer();
    await pickFile();
    fireEvent.click(await screen.findByRole("button", { name: "Import skill (disabled)" }));
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0]![0]).toEqual({
      name: "semver-discipline",
      description: "Use when a PR changes a public API.",
      type: "convention",
      body: "Bump the major version on breaking changes.",
      source: "imported_url",
      enabled: false,
    });
  });

  it("always shows the trust notice", () => {
    renderDrawer();
    expect(screen.getByText(/becomes instructions in your agent's prompt/)).toBeInTheDocument();
  });
});
