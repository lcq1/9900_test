import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { ParticipantPreview } from "../src/participant/StageRenderer";
import {
  submitSession,
  getAIConfig,
  streamChat,
  LlmCallError,
} from "../src/api/participant";
import { createStage, type Experiment } from "../src/types";
import { AIChat } from "../src/participant/AIChat";
import { useTimerController } from "../src/participant/TimerController";

vi.mock("../src/api/participant", async (original) => ({
  ...(await original<typeof import("../src/api/participant")>()),
  submitSession: vi.fn(),
  getAIConfig: vi.fn(),
  streamChat: vi.fn(),
}));

describe("participant runtime", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(submitSession).mockResolvedValue({} as never);
  });

  afterEach(cleanup);

  function study(): Experiment {
    const stage = createStage("short_answer");
    stage.features = {
      ...stage.features,
      timer: false,
      clock: false,
      screenRecording: false,
      pauseAbort: true,
      copyPaste: true,
    };
    stage.components.push({ id: "file", type: "attachment", label: "Notes" });
    return {
      id: "study",
      code: "STUDY-123",
      name: "Design study",
      status: "Live",
      created: "",
      fullScreen: false,
      stages: [stage],
    };
  }

  it("submits answers, attachments and the full event timeline on Finish", async () => {
    const experiment = study(),
      done = vi.fn();
    const { container } = render(
      <ParticipantPreview
        experiment={experiment}
        participantCode="P-001"
        onBack={done}
      />,
    );
    const answer = screen.getByPlaceholderText("Type your response...");
    fireEvent.change(answer, { target: { value: "A lightweight bridge" } });
    fireEvent.blur(answer);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: {
        files: [new File(["notes"], "notes.txt", { type: "text/plain" })],
      },
    });
    await screen.findByText("notes.txt");
    fireEvent.paste(document, {
      clipboardData: { getData: () => "x".repeat(800) },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Finish", exact: true }),
    );
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    const payload = vi.mocked(submitSession).mock.calls[0][0];
    expect(payload.participantCode).toBe("P-001");
    expect(payload.answers).toEqual(
      expect.arrayContaining([
        {
          componentId: experiment.stages[0].components[1].id,
          value: "A lightweight bridge",
        },
        { componentId: "file", value: "data:text/plain;base64,bm90ZXM=" },
      ]),
    );
    expect(
      payload.events.find((e) => e.type === "paste")?.detail?.text,
    ).toHaveLength(800);
    expect(payload.finishedAt).not.toBeNull();
  });

  it("keeps pause/resume and marks aborted sessions incomplete", async () => {
    render(
      <ParticipantPreview
        experiment={study()}
        participantCode="P-002"
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause", exact: true }));
    expect(screen.getByText("Session paused")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Resume/ }));
    expect(screen.queryByText("Session paused")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abort", exact: true }));
    await waitFor(() => expect(submitSession).toHaveBeenCalledOnce());
    expect(vi.mocked(submitSession).mock.calls[0][0].finishedAt).toBeNull();
  });
});

describe("AI chat panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAIConfig).mockResolvedValue({
      model: "configured-server-model",
      configured: true,
    });
  });

  afterEach(cleanup);

  it("renders streamed replies and retries with the same request ID without sending history", async () => {
    vi.mocked(streamChat).mockRejectedValueOnce(
      new LlmCallError("Provider unavailable", true),
    );
    vi.mocked(streamChat).mockImplementationOnce(async (options) => {
      options.onDelta("Consider the load.");
      options.onModel?.("actual-model");
      return {
        text: "Consider the load.",
        model: "actual-model",
        aborted: false,
      };
    });
    const logPrompt = vi.fn(),
      logReply = vi.fn();
    render(
      <AIChat
        stageId="design"
        contextLabel="Design task"
        onUserMessage={logPrompt}
        onAssistantReply={logReply}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Type a question…"), {
      target: { value: "How to design a bridge?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Provider unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Consider the load.");
    expect(vi.mocked(streamChat).mock.calls[1][0]).toMatchObject({
      stageId: "design",
      prompt: "How to design a bridge?",
    });
    expect(vi.mocked(streamChat).mock.calls[1][0].requestId).toBe(
      vi.mocked(streamChat).mock.calls[0][0].requestId,
    );
    expect(vi.mocked(streamChat).mock.calls[1][0]).not.toHaveProperty(
      "history",
    );
    expect(screen.getAllByText("How to design a bridge?")).toHaveLength(1);
    expect(logPrompt).toHaveBeenCalledOnce();
    expect(logReply).toHaveBeenCalledWith("Consider the load.");
    expect(screen.getByText("Text-only · actual-model")).toBeDefined();
  });

  it("keeps the Stop button wired to backend request cancellation", async () => {
    vi.mocked(streamChat).mockImplementation(
      (options) =>
        new Promise((resolve) => {
          options.signal?.addEventListener("abort", () =>
            resolve({ text: "", model: "", aborted: true }),
          );
        }),
    );
    render(<AIChat stageId="design" />);
    fireEvent.change(screen.getByPlaceholderText("Type a question…"), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send" })).toBeDefined(),
    );
    expect(vi.mocked(streamChat).mock.calls[0][0].signal?.aborted).toBe(true);
  });

  it("sends only the new prompt on later turns while keeping old messages visible", async () => {
    vi.mocked(streamChat).mockImplementation(async (options) => {
      options.onDelta("reply to " + options.prompt);
      return {
        text: "reply to " + options.prompt,
        model: "server-model",
        aborted: false,
      };
    });
    render(<AIChat stageId="design" />);
    for (const prompt of ["first question", "second question"]) {
      fireEvent.change(screen.getByPlaceholderText("Type a question…"), {
        target: { value: prompt },
      });
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
      await screen.findByText("reply to " + prompt);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Send" })).toBeDefined(),
      );
    }
    const first = vi.mocked(streamChat).mock.calls[0][0],
      second = vi.mocked(streamChat).mock.calls[1][0];
    expect(second.prompt).toBe("second question");
    expect(second.conversationId).toBe(first.conversationId);
    expect(second.requestId).not.toBe(first.requestId);
    expect(second).not.toHaveProperty("history");
    expect(screen.getByText("first question")).toBeDefined();
    expect(screen.getByText("reply to first question")).toBeDefined();
  });
});

describe("countdown controller", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  it("pauses, resumes, resets for another stage, and stops at zero", () => {
    vi.useFakeTimers();
    const { result, rerender, unmount } = renderHook(
      ({ enabled, stageId }) =>
        useTimerController({ initialSeconds: 3, enabled, stageId }),
      { initialProps: { enabled: true, stageId: "first" } },
    );
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(2);
    rerender({ enabled: false, stageId: "first" });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.remaining).toBe(2);
    act(() => result.current.reset(3));
    rerender({ enabled: true, stageId: "next" });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.remaining).toBe(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
