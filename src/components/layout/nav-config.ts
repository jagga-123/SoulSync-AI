import {
  Bell,
  CreditCard,
  Compass,
  Gift,
  Heart,
  HeartHandshake,
  LayoutDashboard,
  MessageCircle,
  MessageCircleHeart,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/** The four places a member goes every day — desktop top bar and the mobile bottom tab bar share them. */
export const PRIMARY_DESTINATIONS = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/likes", label: "Likes", icon: Heart },
  { href: "/matches", label: "Matches", icon: HeartHandshake },
  { href: "/messages", label: "Messages", icon: MessageCircle },
] as const satisfies ReadonlyArray<{ href: string; label: string; icon: LucideIcon }>;

/** Everything else lives under "Me" (the account menu on desktop, the bottom sheet on phones). */
export const ACCOUNT_LINKS: ReadonlyArray<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/personality-report", label: "My AI report", icon: Sparkles },
  { href: "/ai-interview", label: "AI interview", icon: MessageCircleHeart },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/premium", label: "My perks", icon: Sparkles },
  { href: "/billing", label: "Plan & billing", icon: CreditCard },
  { href: "/referrals", label: "Invite friends", icon: Gift },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Routes that belong to the "Me" tab (so it shows as the active one). */
export const ME_ROUTES = [...ACCOUNT_LINKS.map((l) => l.href), "/onboarding"];

/** Screens where the bottom tab bar is not shown: marketing/auth pages, admin, and inside a chat thread (the composer needs the space). */
export function tabBarHidden(pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith("/admin")) return true;
  if (/^\/messages\/[^/]+/.test(pathname)) return true;
  return ["/login", "/register", "/waitlist", "/verify-email", "/unsubscribe", "/billing/mock-checkout"].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
