import type { ReactNode } from "react";
import { ShieldCheck, CalendarRange, Briefcase, Headset } from "lucide-react";

const FEATURES = [
  { icon: Briefcase, label: "Recruitment & onboarding" },
  { icon: CalendarRange, label: "Rota & reassignment" },
  { icon: ShieldCheck, label: "CQC compliance" },
  { icon: Headset, label: "CRM & helpdesk" },
];

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <div className="uc-hero relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex lg:min-h-screen lg:rounded-none">
        <img src="/logo-white.png" alt="Unique Care UK" className="relative z-[1] h-10 w-auto self-start" />
        <div className="relative z-[1] max-w-lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
            Operations platform
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-[1.1] tracking-tight text-white">
            UniqueCare Connect
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/85">
            One secure system for recruitment, the weekly rota, CQC care plans and the CRM —
            built for Unique Care UK.
          </p>
          <ul className="mt-8 grid grid-cols-2 gap-3">
            {FEATURES.map((feature) => (
              <li
                key={feature.label}
                className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm backdrop-blur-sm"
              >
                <feature.icon className="h-4 w-4 shrink-0" aria-hidden />
                {feature.label}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-[1] text-xs text-white/55">
          CQC-registered domiciliary care · Data hosted in the UK · UK GDPR compliant
        </p>
      </div>
      <div className="uc-canvas flex items-center justify-center overflow-y-auto p-6 sm:p-10">
        <div className="w-full max-w-md py-6">
          <img src="/logo.png" alt="Unique Care UK" className="mb-8 h-10 w-auto lg:hidden" />
          {children}
        </div>
      </div>
    </div>
  );
}
