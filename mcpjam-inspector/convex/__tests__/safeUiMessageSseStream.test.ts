import { describe, expect, it } from "vitest";
import { wrapUiMessageSseBody } from "../lib/safeUiMessageSseStream";

async function collectBytes(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe("wrapUiMessageSseBody", () => {
  it("passes through a normal SSE chunk stream", async () => {
    const line = `data: ${JSON.stringify({ type: "text-start", id: "1" })}\n\n`;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(line));
        controller.close();
      },
    });
    const text = await collectBytes(wrapUiMessageSseBody(source));
    expect(text).toContain("text-start");
  });

  it("emits error SSE and DONE when the source stream errors", async () => {
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("anthropic billing"));
      },
    });
    const text = await collectBytes(wrapUiMessageSseBody(source));
    expect(text).toContain('"type":"error"');
    expect(text).toContain("anthropic billing");
    expect(text).toContain("[DONE]");
  });
});
