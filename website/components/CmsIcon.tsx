import {
  Activity,
  Award,
  Banknote,
  Bike,
  Brain,
  CheckCircle2,
  Clock3,
  GraduationCap,
  HandHeart,
  Heart,
  HeartHandshake,
  HeartPulse,
  Home,
  MapPin,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Activity,
  Award,
  Banknote,
  Bike,
  Brain,
  CheckCircle2,
  Clock3,
  GraduationCap,
  HandHeart,
  Heart,
  HeartHandshake,
  HeartPulse,
  Home,
  MapPin,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  Users,
  Zap,
};

/** Resolve a CMS icon name (lucide component name) to an icon, with a safe fallback. */
export function iconByName(name: unknown, fallback: LucideIcon = HeartHandshake): LucideIcon {
  return typeof name === "string" && ICONS[name] ? ICONS[name] : fallback;
}
