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

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
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
