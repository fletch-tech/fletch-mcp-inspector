/**
 * Convex HTTP actions return a Response whose body is a ReadableStream. If that
 * stream rejects while the provider (e.g. Anthropic) fails mid-flight, some
 * runtimes do not recover cleanly and later requests can 500 until restart.
 *
 * This wrapper consumes the upstream byte stream and never rejects; provider
 * failures are turned into UI message stream error SSE events plus [DONE].
 */

export function wrapUiMessageSseBody(
  source: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      reader = source.getReader();

      const pump = (): Promise<void> =>
        reader!.read().then(({ done, value }) => {
          if (done) {
            controller.close();
            return;
          }
          controller.enqueue(value);
          return pump();
        }).catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          try {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "error", errorText: msg })}\n\n`,
              ),
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch {
            // ignore
          }
          try {
            controller.close();
          } catch {
            // ignore
          }
        });

      return pump();
    },
    cancel(reason) {
      return reader?.cancel(reason);
    },
  });
}
