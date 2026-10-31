import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AuthScreen } from "../src/pages/LoginPage";
import { clear, getSession, setSession } from "../src/auth/sessionStore";
import { signIn } from "../src/api/auth";
import { streamChat, LlmCallError } from "../src/api/participant";

vi.mock("../src/api/auth", () => ({
  signIn: vi.fn(),
  registerResearcher: vi.fn(),
}));

describe("authentication", () => {
  beforeEach(() => {
    localStorage.clear();
    clear();
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("keeps the three-role login and stores the authenticated session", async () => {
    const session = {
      token: "retained-token",
      issuedAt: "2026-10-27",
      researcher: {
        id: "r1",
        name: "Alice",
        email: "alice@example.com",
        role: "researcher" as const,
        createdAt: "2026-10-27",
      },
    };
    vi.mocked(signIn).mockResolvedValue(session);
    const signedIn = vi.fn();
    render(<AuthScreen onSignIn={signedIn} onParticipant={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Participant", exact: true }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Administrator", exact: true }),
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Researcher", exact: true }),
    );
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Researcher log in", exact: true }),
    );
    await waitFor(() => expect(signedIn).toHaveBeenCalledOnce());
    expect(getSession()).toEqual(session);
    expect(JSON.parse(localStorage.getItem("p13-researcher-session")!)).toEqual(
      session,
    );
    clear();
    expect(getSession()).toBeNull();
  });

  it("passes participant codes through the existing login form", () => {
    const enter = vi.fn();
    render(<AuthScreen onSignIn={vi.fn()} onParticipant={enter} />);
    fireEvent.change(screen.getByLabelText("Experiment code"), {
      target: { value: " STUDY-123 " },
    });
    fireEvent.change(screen.getByLabelText("Participant code"), {
      target: { value: " P-001 " },
    });
    fireEvent.submit(
      screen.getByLabelText("Participant code").closest("form")!,
    );
    expect(enter).toHaveBeenCalledWith("STUDY-123", "P-001");
  });

  it("notifies subscribers when a saved session is cleared", () => {
    setSession({
      token: "token",
      issuedAt: "",
      researcher: {
        id: "r1",
        name: "Alice",
        email: "a@b.test",
        role: "researcher",
        createdAt: "",
      },
    });
    clear();
    expect(localStorage.getItem("p13-researcher-session")).toBeNull();
    expect(getSession()).toBeNull();
  });
});

describe("authenticated AI transport", () => {
  beforeEach(() => {
    setSession({
      token: "local-session",
      issuedAt: "",
      researcher: {
        id: "r",
        name: "R",
        email: "r@example.test",
        role: "researcher",
        createdAt: "",
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clear();
  });

  const ids = { conversationId: "conversation", requestId: "request" };

  function response(body: string) {
    const bytes = new TextEncoder().encode(body);
    return new Response(
      new ReadableStream({
        start(controller) {
          for (let i = 0; i < bytes.length; i += 3)
            controller.enqueue(bytes.slice(i, i + 3));
          controller.close();
        },
      }),
      { headers: { "Content-Type": "application/x-ndjson" } },
    );
  }

  it("sends only the current prompt and fixed-size IDs to the local backend and decodes fragmented UTF-8", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response(
          '{"type":"delta","text":"你好","model":"server-model"}\n{"type":"done","model":"server-model"}\n',
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const onDelta = vi.fn(),
      onModel = vi.fn();
    const result = await streamChat({
      stageId: "stage-1",
      prompt: "hello",
      ...ids,
      onDelta,
      onModel,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/participant/stages/stage-1/ai-stream");
    expect(JSON.parse(init.body)).toEqual({ content: "hello", ...ids });
    expect(init.headers.Authorization).toBe("Bearer local-session");
    expect(init.headers["x-wb-webapp-access-key"]).toBeUndefined();
    expect(result).toEqual({
      text: "你好",
      model: "server-model",
      aborted: false,
    });
    expect(onDelta).toHaveBeenCalledWith("你好");
    expect(onModel).toHaveBeenCalledWith("server-model");
  });

  it("keeps partial text but reports provider errors and incomplete streams", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response(
            '{"type":"delta","text":"partial"}\n{"type":"error","message":"Please retry","retryable":true}\n',
          ),
        ),
    );
    const options = {
      stageId: "stage",
      prompt: "hello",
      ...ids,
      onDelta: vi.fn(),
    };
    await expect(streamChat(options)).rejects.toMatchObject({
      message: "Please retry",
      partialText: "partial",
      retryable: true,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response('{"type":"delta","text":"partial"}\n')),
    );
    await expect(streamChat(options)).rejects.toBeInstanceOf(LlmCallError);
  });

  it("clears expired login sessions and preserves useful backend errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Please sign in again" }), {
          status: 401,
        }),
      ),
    );
    await expect(
      streamChat({
        stageId: "stage",
        prompt: "hello",
        ...ids,
        onDelta: vi.fn(),
      }),
    ).rejects.toMatchObject({
      message: "Please sign in again",
      retryable: false,
    });
    expect(getSession()).toBeNull();
  });

  it("forwards Stop cancellation and retains already received text", async () => {
    const abort = new AbortController();
    let cancelled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) => {
        expect(init.signal).toBe(abort.signal);
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode('{"type":"delta","text":"first"}\n'),
                );
                init.signal.addEventListener("abort", () => {
                  cancelled = true;
                  controller.error(new DOMException("Aborted", "AbortError"));
                });
              },
            }),
          ),
        );
      }),
    );
    const result = await streamChat({
      stageId: "stage",
      prompt: "hello",
      ...ids,
      signal: abort.signal,
      onDelta: () => abort.abort(),
    });
    expect(cancelled).toBe(true);
    expect(result).toMatchObject({ text: "first", aborted: true });
  });
});
