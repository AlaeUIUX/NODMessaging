import type { Message } from "./types";

export class SendFailure extends Error {
  constructor(message = "Message could not be delivered") {
    super(message);
    this.name = "SendFailure";
  }
}

let forceFailure = false;

/** Dev toggle so the offline/rollback path is testable without pulling the network. */
export function setForceFailure(value: boolean) {
  forceFailure = value;
}
export function getForceFailure() {
  return forceFailure;
}

export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

let forceNetFailure = false;

/**
 * Dev toggle for everything else that needs the network: saving to Mind,
 * link previews, book search, Explore and publishing to it. Each fails the
 * way it would offline, so its failure state can be seen.
 */
export function setForceNetFailure(value: boolean) {
  forceNetFailure = value;
}
export function getForceNetFailure() {
  return forceNetFailure;
}
/** Whether a request would fail right now: forced from the developer panel, or really offline. */
export function netDown() {
  return forceNetFailure || isOffline();
}
/** What a failed request says: offline, or just didn't go through. */
export const netFailureText = () => (isOffline() ? "You're offline" : "Couldn't reach NOD");

/**
 * Stands in for a round trip to the server: a little time (with some jitter,
 * like sendMessage), then whether it went through. Everything is local in
 * the prototype; this is where loading and failing come from.
 */
export function roundTrip({ latencyMs = 300, jitterMs = 400 }: { latencyMs?: number; jitterMs?: number } = {}): Promise<boolean> {
  return new Promise((resolve) => setTimeout(() => resolve(!netDown()), latencyMs + Math.random() * jitterMs));
}

/**
 * Stands in for the server write. Resolves with the accepted message (id
 * assigned server-side in a real backend) or throws so the caller can roll the
 * optimistic message back into a retryable failed state.
 */
export function sendMessage(message: Message, { latencyMs = 420 }: { latencyMs?: number } = {}): Promise<Message> {
  return new Promise((resolve, reject) => {
    const jitter = latencyMs + Math.random() * 280;
    setTimeout(() => {
      if (forceFailure || isOffline()) {
        reject(new SendFailure(isOffline() ? "You're offline" : "Send failed"));
        return;
      }
      resolve({ ...message, status: "sent" });
    }, jitter);
  });
}
