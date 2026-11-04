import {
  Award,
  Banknote,
  Bike,
  Brain,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Heart,
  HeartHandshake,
  Home,
  MapPin,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Award,
  Banknote,
  Bike,
  Brain,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Heart,
  HeartHandshake,
  Home,
  MapPin,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Zap,
};

/** Resolve a CMS icon name (lucide component name) to an icon, with a safe fallback. */
export function iconByName(name: unknown, fallback: LucideIcon = Sparkles): LucideIcon {
  return typeof name === "string" && ICONS[name] ? ICONS[name] : fallback;
}
