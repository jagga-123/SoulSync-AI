import type { Metadata } from "next";
import { FlagsView } from "@/components/admin/flags-view";

export const metadata: Metadata = { title: "Feature flags" };

export default function Page() {
  return <FlagsView />;
}
