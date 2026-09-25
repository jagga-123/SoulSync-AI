import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your SoulSync dashboard.",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return <DashboardView />;
}
