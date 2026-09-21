import type { Metadata } from "next";
import { WaitlistAdminView } from "@/components/admin/waitlist-admin-view";

export const metadata: Metadata = { title: "Waitlist" };

export default function Page() {
  return <WaitlistAdminView />;
}
