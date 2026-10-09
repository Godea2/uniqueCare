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
    <div className="min-h-screen grid md:grid-cols-2 bg-white">
      <div className="hidden md:flex flex-col justify-between p-10 text-white" style={{ background: "linear-gradient(160deg, #082f52 0%, #0a4a75 55%, #0575a8 100%)" }}>
        <img src="/logo-white.png" alt="Unique Care UK" className="h-10 w-auto self-start" />
        <div>
          <h1 className="text-3xl font-semibold leading-tight text-white">UniqueCare Connect</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-blue-100 max-w-md">
            One secure system for the whole care operation — recruitment and onboarding,
            the weekly rota, CQC compliance and the CRM, with every call, visit and
            document in one place.
          </p>
          <ul className="mt-8 grid grid-cols-2 gap-3 max-w-md">
            {FEATURES.map((feature) => (
              <li key={feature.label} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm" style={{ background: "rgb(255 255 255 / 0.08)", border: "1px solid rgb(255 255 255 / 0.14)" }}>
                <feature.icon className="h-4 w-4 shrink-0" aria-hidden />
                {feature.label}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-blue-200">
          CQC-registered domiciliary care · Data hosted in the UK · UK GDPR compliant
        </p>
      </div>
      <div className="flex items-center justify-center p-8 overflow-y-auto" style={{ background: "var(--brand-50)" }}>
        <div className="w-full max-w-sm py-6">
          <img src="/logo.png" alt="Unique Care UK" className="h-10 w-auto mb-8 md:hidden" />
          {children}
        </div>
      </div>
    </div>
  );
}
