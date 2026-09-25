import type { Metadata } from "next";
import { ChatView } from "@/components/chat/chat-view";

export const metadata: Metadata = {
  title: "Chat",
  description: "Your conversation on SoulSync.",
  robots: { index: false, follow: false },
};

export default function ChatPage() {
  return <ChatView />;
}
