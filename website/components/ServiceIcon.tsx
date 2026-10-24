import {
  Accessibility,
  BedDouble,
  Brain,
  Building2,
  Coffee,
  HeartHandshake,
  Home,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  home: Home,
  bed: BedDouble,
  building: Building2,
  accessibility: Accessibility,
  brain: Brain,
  coffee: Coffee,
  "heart-handshake": HeartHandshake,
  "trending-up": TrendingUp,
};

export default function ServiceIcon({ name, className }: { name: string; className?: string }) {
  const Icon = MAP[name] ?? Home;
  return <Icon className={className ?? "h-6 w-6"} aria-hidden />;
}
