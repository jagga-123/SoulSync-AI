import type { Metadata } from "next";
import { AnalyticsView } from "@/components/admin/analytics-view";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return <AnalyticsView />;
}
