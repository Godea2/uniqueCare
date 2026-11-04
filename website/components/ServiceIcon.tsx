import {
  Accessibility,
  Activity,
  BedDouble,
  Brain,
  Building2,
  Coffee,
  HandHeart,
  HeartHandshake,
  HeartPulse,
  Home,
  Stethoscope,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

/** Healthcare-oriented icon map for service cards. */
const MAP: Record<string, LucideIcon> = {
  home: Home,
  bed: BedDouble,
  building: Building2,
  accessibility: Accessibility,
  brain: Brain,
  coffee: Coffee,
  "heart-handshake": HeartHandshake,
  "trending-up": TrendingUp,
  stethoscope: Stethoscope,
  "heart-pulse": HeartPulse,
  activity: Activity,
  users: Users,
  "hand-heart": HandHeart,
};

export default function ServiceIcon({ name, className }: { name: string; className?: string }) {
  const Icon = MAP[name] ?? HeartHandshake;
  return <Icon className={className ?? "h-7 w-7"} aria-hidden strokeWidth={1.75} />;
}
