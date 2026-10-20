import type { ReactNode } from "react";

/**
 * Shared chrome for Login / Signup / Forgot / Set password.
 * Left: cropped brand illustration. Right: form.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      <aside
        className="relative hidden min-h-screen overflow-hidden bg-[#cfeaf8] lg:block"
        aria-label="Unique Care UK"
      >
        <img
          src="/auth-hero.jpg"
          alt="Unique Care UK — recruitment, rota, CQC care plans and CRM in one secure system"
          className="absolute inset-0 h-full w-full object-cover object-[center_20%]"
          decoding="async"
        />
      </aside>

      <div className="uc-canvas flex min-h-screen items-center justify-center overflow-y-auto px-6 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <img src="/logo.png" alt="Unique Care UK" className="mb-8 h-10 w-auto lg:hidden" />
          {children}
        </div>
      </div>
    </div>
  );
}
