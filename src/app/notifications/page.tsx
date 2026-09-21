import type { Metadata } from "next";
import { NotificationsView } from "@/components/platform/notifications-view";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Your SoulSync AI notifications.",
  robots: { index: false, follow: false },
};

export default function NotificationsPage() {
  return <NotificationsView />;
}
