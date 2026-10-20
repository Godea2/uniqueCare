import type { ReactNode } from "react";

/**
 * Shared chrome for Login / Signup / Forgot / Set password.
 * Left panel: brand illustration (desktop). Right: form.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside
        className="relative hidden overflow-hidden bg-[#d8f0fb] lg:block"
        aria-hidden={false}
        aria-label="Unique Care UK"
      >
        <img
          src="/auth-hero.jpg"
          alt="Unique Care UK — recruitment, rota, CQC care plans and CRM in one secure system"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      </aside>

      <div className="uc-canvas flex items-center justify-center overflow-y-auto p-6 sm:p-10">
        <div className="w-full max-w-md py-6">
          <img src="/logo.png" alt="Unique Care UK" className="mb-8 h-10 w-auto lg:hidden" />
          {children}
        </div>
      </div>
    </div>
  );
}
