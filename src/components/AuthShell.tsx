import type { ReactNode } from "react";

/**
 * Shared chrome for Login / Signup / Forgot / Set password.
 * Full-bleed photo brand panel + focused form column.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[1.05fr_0.95fr]">
      <aside
        className="relative hidden min-h-screen overflow-hidden bg-[--brand-900] lg:flex lg:flex-col"
        aria-label="Unique Care UK"
      >
        <img
          src="/auth-hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full scale-105 object-cover object-center"
          decoding="async"
        />
        {/* Atmosphere: soft brand wash + readable base */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(165deg, rgb(4 30 51 / 0.35) 0%, rgb(4 30 51 / 0.55) 42%, rgb(4 30 51 / 0.88) 100%)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, rgb(5 134 191 / 0.55), transparent 70%)" }}
          aria-hidden
        />

        <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
          <img
            src="/logo-white.png"
            alt="Unique Care UK"
            className="h-11 w-auto drop-shadow-sm"
          />

          <div className="max-w-lg pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
              Staff workspace
            </p>
            <h1 className="mt-3 font-display text-[2.35rem] font-semibold leading-[1.12] tracking-tight text-white xl:text-[2.75rem]">
              Care operations,
              <br />
              one secure place.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/80">
              Recruitment, rota, compliance and CRM — built for Unique Care UK teams.
            </p>
          </div>
        </div>
      </aside>

      <div className="relative flex min-h-screen items-center justify-center overflow-y-auto bg-[--frame-bg] px-6 py-12 sm:px-10">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-80"
          style={{ background: "linear-gradient(180deg, var(--brand-50), transparent)" }}
          aria-hidden
        />
        <div className="relative w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/logo.png" alt="Unique Care UK" className="h-9 w-auto" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
