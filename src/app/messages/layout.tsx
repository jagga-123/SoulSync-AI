import type { ReactNode } from "react";
import { SocketProvider } from "@/components/chat/socket-provider";

export default function MessagesLayout({ children }: { children: ReactNode }) {
  return <SocketProvider>{children}</SocketProvider>;
}
