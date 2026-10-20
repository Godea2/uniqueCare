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
    <div className="grid min-h-screen md:grid-cols-2">
      <div
        className="relative hidden flex-col justify-between overflow-hidden p-10 text-white md:flex"
        style={{ backgroundImage: "var(--sidebar-gradient)" }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(500px 280px at 10% 0%, rgb(255 255 255 / 0.12), transparent 55%), radial-gradient(420px 260px at 90% 90%, rgb(5 134 191 / 0.35), transparent 50%)",
          }}
          aria-hidden
        />
        <img src="/logo-white.png" alt="Unique Care UK" className="relative z-[1] h-10 w-auto self-start" />
        <div className="relative z-[1]">
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-white">
            UniqueCare Connect
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/85">
            One secure system for the whole care operation — recruitment and onboarding,
            the weekly rota, CQC compliance and the CRM, with every call, visit and
            document in one place.
          </p>
          <ul className="mt-8 grid max-w-md grid-cols-2 gap-3">
            {FEATURES.map((feature) => (
              <li
                key={feature.label}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm"
                style={{ background: "rgb(255 255 255 / 0.1)", border: "1px solid rgb(255 255 255 / 0.14)" }}
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
      <div
        className="flex items-center justify-center overflow-y-auto p-8"
        style={{
          background:
            "radial-gradient(700px 360px at 80% 0%, rgb(5 134 191 / 0.08), transparent 55%), linear-gradient(180deg, #f7fafc 0%, var(--brand-50) 100%)",
        }}
      >
        <div className="w-full max-w-sm py-6">
          <img src="/logo.png" alt="Unique Care UK" className="mb-8 h-10 w-auto md:hidden" />
          {children}
        </div>
      </div>
    </div>
  );
}
