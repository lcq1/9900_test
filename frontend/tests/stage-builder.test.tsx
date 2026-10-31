import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { StageContentEditor } from "../src/researcher/StageContentEditor";
import { createStage, type Experiment, getPublishErrors } from "../src/types";

import { MemoryRouter } from "react-router-dom";
import App from "../src/App";
import { clear, setSession } from "../src/auth/sessionStore";

describe("stage content", () => {
  afterEach(cleanup);

  function Harness() {
    const [stage, setStage] = useState(() => createStage("single_choice"));
    return (
      <>
        <StageContentEditor stage={stage} onUpdateStage={setStage} />
        <output data-testid="stage">{JSON.stringify(stage)}</output>
      </>
    );
  }

  it("changes single choice to multiple choice without losing options", () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "multiple_choice" },
    });
    const stage = JSON.parse(screen.getByTestId("stage").textContent!);
    expect(stage.type).toBe("multiple_choice");
    expect(
      stage.components.find((c: { type: string }) => c.type === "checkbox")
        .options,
    ).toEqual(["Option A", "Option B"]);
  });

  it("retains rating, signature and attachment authoring controls", () => {
    render(<Harness />);
    for (const label of ["Rating", "Signature", "Attachment"])
      fireEvent.click(screen.getByRole("button", { name: label, exact: true }));
    const stage = JSON.parse(screen.getByTestId("stage").textContent!);
    expect(stage.components.map((c: { type: string }) => c.type)).toEqual(
      expect.arrayContaining(["rating", "signature", "attachment"]),
    );
  });
});

const api = vi.hoisted(() => ({
  experiments: [] as Experiment[],
  save: vi.fn(),
}));

vi.mock("antd", () => ({
  Alert: ({
    title,
    description,
  }: {
    title: string;
    description?: import("react").ReactNode;
  }) => (
    <div role="alert">
      {title}
      {description}
    </div>
  ),
  Modal: { confirm: vi.fn() },
}));

vi.mock("../src/api/experiments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/experiments")>()),
  useExperiments: () => ({
    experiments: api.experiments,
    loading: false,
    error: null,
    saveExperiment: api.save,
  }),
}));

function experiment(): Experiment {
  return {
    id: "publish-study",
    name: "Publish study",
    code: "EXP-PUBLISH",
    status: "Draft",
    created: "2026-10-27",
    fullScreen: false,
    stages: [createStage("consent"), createStage("short_answer")],
  };
}

function openEditor() {
  render(
    <MemoryRouter initialEntries={["/researcher/experiment/publish-study"]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.experiments = [experiment()];
  api.save
    .mockReset()
    .mockImplementation(async (input: Experiment) => structuredClone(input));
  setSession({
    token: "test-token",
    issuedAt: "2026-10-27",
    researcher: {
      id: "researcher",
      name: "Researcher",
      email: "test@example.com",
      role: "researcher",
      createdAt: "2026-10-27",
    },
  });
});

afterEach(() => {
  cleanup();
  clear();
});

describe("publish validation", () => {
  it("accepts consent plus a valid question", () => {
    expect(getPublishErrors(experiment())).toEqual([]);
  });
  it("rejects consent-only studies and closed experiments", () => {
    const draft = experiment();
    draft.stages.pop();
    expect(getPublishErrors(draft).join(" ")).toContain("2–20");
    draft.status = "Closed";
    expect(getPublishErrors(draft)).toContain(
      "Closed experiments cannot be published again.",
    );
  });
  it("rejects missing consent, blank choices and invalid timers", () => {
    const draft = experiment();
    draft.stages = [createStage("single_choice"), createStage("short_answer")];
    draft.stages[0].components[1].options = ["A", " "];
    draft.stages[1].countdownMinutes = 0;
    const errors = getPublishErrors(draft).join(" ");
    expect(errors).toContain("only consent stage");
    expect(errors).toContain("non-empty options");
    expect(errors).toContain("positive whole number");
  });
});

describe("editor publishing", () => {
  it("retains automatic saving of edits", async () => {
    openEditor();
    fireEvent.change(screen.getByDisplayValue("Publish study"), {
      target: { value: "Autosaved study" },
    });
    await waitFor(
      () =>
        expect(api.save).toHaveBeenCalledWith(
          expect.objectContaining({ name: "Autosaved study" }),
        ),
      { timeout: 2000 },
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Save draft",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
  });
  it("saves the current unsaved content as Live and shows success after the response", async () => {
    openEditor();
    fireEvent.change(screen.getByDisplayValue("Publish study"), {
      target: { value: "Updated study" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Publish", exact: true }),
    );
    await screen.findByText(
      /Experiment published\. Experiment code: EXP-PUBLISH/,
    );
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Updated study", status: "Live" }),
    );
    expect(
      (screen.getByRole("button", { name: "Published" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("shows validation errors without making a save request", async () => {
    api.experiments[0].stages.pop();
    openEditor();
    fireEvent.click(
      screen.getByRole("button", { name: "Publish", exact: true }),
    );
    expect(
      await screen.findByText("This experiment is not ready to publish"),
    ).toBeTruthy();
    expect(api.save).not.toHaveBeenCalled();
  });
  it("preserves the draft and allows retry after a failed publication", async () => {
    api.save.mockRejectedValueOnce(new Error("Publication failed"));
    openEditor();
    fireEvent.click(
      screen.getByRole("button", { name: "Publish", exact: true }),
    );
    await screen.findByText("Publication failed");
    expect(
      screen.getByText("Draft", { selector: ".status-pill" }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Publish",
          exact: true,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("prevents duplicate requests and preserves edits made during publication", async () => {
    let finish!: (value: Experiment) => void;
    api.save.mockImplementationOnce(
      () =>
        new Promise<Experiment>((resolve) => {
          finish = resolve;
        }),
    );
    openEditor();
    fireEvent.click(
      screen.getByRole("button", { name: "Publish", exact: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Publishing…" }));
    fireEvent.change(screen.getByDisplayValue("Publish study"), {
      target: { value: "Newer edit" },
    });
    finish({ ...api.experiments[0], status: "Live" });
    await screen.findByText(/Newer edits are still unsaved/);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("Newer edit")).toBeTruthy();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Publish changes",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  });
});
