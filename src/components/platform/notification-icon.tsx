import { Bell, CreditCard, Eye, Gift, Heart, MessageCircle, ShieldCheck, Sparkles, Users, type LucideIcon } from "lucide-react";
import type { NotificationType } from "@/types/platform";

const ICONS: Record<NotificationType, LucideIcon> = {
  like_received: Heart,
  match_created: Users,
  message_received: MessageCircle,
  profile_viewed: Eye,
  ai_recommendation: Sparkles,
  subscription: CreditCard,
  referral: Gift,
  safety: ShieldCheck,
  system: Bell,
};

export function NotificationIcon({ type, className = "size-4" }: { type: NotificationType; className?: string }) {
  const Icon = ICONS[type] ?? Bell;
  return <Icon className={className} aria-hidden />;
}
