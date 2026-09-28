import type { ChatTransport, TransportEvent } from "./types";

const CHANNEL = "nod-chat";

/**
 * Realtime over BroadcastChannel: real pub/sub between tabs with no infra, and
 * the same event shape a WebSocket/Pusher/Ably adapter would implement. Swap
 * this for a socket transport and nothing above it changes.
 */
export function createBroadcastTransport(): ChatTransport {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return { publish() {}, subscribe: () => () => {}, close() {} };
  }

  const channel = new BroadcastChannel(CHANNEL);
  const handlers = new Set<(event: TransportEvent) => void>();
  let closed = false;

  channel.onmessage = (e: MessageEvent<TransportEvent>) => {
    handlers.forEach((h) => h(e.data));
  };

  return {
    publish(event) {
      // A closed channel throws; late publishes (a pagehide "bye") are just dropped.
      if (!closed) channel.postMessage(event);
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      closed = true;
      handlers.clear();
      channel.close();
    },
  };
}

export const NULL_TRANSPORT: ChatTransport = { publish() {}, subscribe: () => () => {}, close() {} };

export const PRESENCE_INTERVAL_MS = 2000;
export const PRESENCE_TIMEOUT_MS = 6000;

export interface Peer {
  clientId: string;
  userId: string;
  at: number;
}

/** Same tabs as the same people: heartbeats alone shouldn't re-render the app. */
export function samePeers(a: Peer[], b: Peer[]) {
  return a.length === b.length && a.every((p, i) => p.clientId === b[i].clientId && p.userId === b[i].userId);
}
