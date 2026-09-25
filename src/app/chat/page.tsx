import type { Metadata } from "next";
import ChatApp from "@/components/chat/ChatApp";

export const metadata: Metadata = {
  title: "NOD — Where projects get talked through",
  description: "NOD is a messenger for people who run projects: Spaces for every team, polls, checklists and payments right in the thread, and Mind to keep what matters.",
};

export default function ChatPage() {
  return <ChatApp />;
}
