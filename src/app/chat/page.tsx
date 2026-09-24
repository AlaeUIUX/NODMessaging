import type { Metadata } from "next";
import ChatApp from "@/components/chat/ChatApp";

export const metadata: Metadata = {
  title: "NOD — Messaging, quietly",
  description: "A calm, private messenger with reactions, replies and voice notes.",
};

export default function ChatPage() {
  return <ChatApp />;
}
