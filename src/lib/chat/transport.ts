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

  channel.onmessage = (e: MessageEvent<TransportEvent>) => {
    handlers.forEach((h) => h(e.data));
  };

  return {
    publish(event) {
      channel.postMessage(event);
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      handlers.clear();
      channel.close();
    },
  };
}

export const PRESENCE_INTERVAL_MS = 2000;
export const PRESENCE_TIMEOUT_MS = 6000;

export interface Peer {
  clientId: string;
  userId: string;
  at: number;
}

/** Drops peers whose last heartbeat is older than the timeout. */
export function prunePeers(peers: Peer[], now = Date.now()): Peer[] {
  return peers.filter((p) => now - p.at < PRESENCE_TIMEOUT_MS);
}
