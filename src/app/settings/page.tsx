import type { Metadata } from "next";
import { SettingsView } from "@/components/platform/settings-view";

export const metadata: Metadata = {
  title: "Settings",
  description: "Your SoulSync account settings.",
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return <SettingsView />;
}
