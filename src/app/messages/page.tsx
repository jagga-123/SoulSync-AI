import type { Metadata } from "next";
import { ConversationsView } from "@/components/chat/conversations-view";

export const metadata: Metadata = {
  title: "Messages",
  description: "Your conversations on SoulSync.",
  robots: { index: false, follow: false },
};

export default function MessagesPage() {
  return <ConversationsView />;
}
