import type { Metadata } from "next";
import ChatApp from "@/components/chat/ChatApp";

export const metadata: Metadata = {
  title: "NOD Chat",
  description: "Phase 0 + Phase 1 of the NOD chat build spec — realtime, optimistic send, persisted model.",
};

export default function ChatPage() {
  return <ChatApp />;
}
