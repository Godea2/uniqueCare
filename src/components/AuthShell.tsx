import type { ReactNode } from "react";

/**
 * Shared chrome for Login / Signup / Forgot / Set password.
 * Left: full brand illustration (desktop). Right: compact form column.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      <aside
        className="relative hidden min-h-screen flex-1 bg-[#d8f0fb] lg:block"
        aria-label="Unique Care UK"
      >
        <img
          src="/auth-hero.jpg"
          alt="Unique Care UK — recruitment, rota, CQC care plans and CRM in one secure system"
          className="absolute inset-0 h-full w-full object-contain object-center"
          decoding="async"
        />
      </aside>

      <div className="uc-canvas flex w-full min-h-screen flex-col items-center justify-center overflow-y-auto px-6 py-10 sm:px-10 lg:w-[min(100%,28rem)] lg:shrink-0 lg:border-l lg:border-[--card-line]">
        <div className="w-full max-w-md py-2">
          <img src="/logo.png" alt="Unique Care UK" className="mb-8 h-10 w-auto lg:hidden" />
          {children}
        </div>
      </div>
    </div>
  );
}
