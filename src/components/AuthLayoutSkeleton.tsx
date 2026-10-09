import { Skeleton } from "./ui/skeleton";

export function AuthLayoutSkeleton() {
  return (
    <div className="min-h-screen w-full md:p-4" style={{ backgroundColor: "var(--frame-bg)" }}>
      <div
        className="uc-frame flex min-h-screen md:min-h-0 md:h-[calc(100vh-2rem)] max-md:!rounded-none"
        style={{ backgroundColor: "var(--app-bg)" }}
      >
        {/* Sidebar skeleton */}
        <div className="uc-sidebar hidden md:flex w-64 shrink-0 flex-col p-4">
          <Skeleton className="mx-2 mb-6 h-8 w-32 rounded-md bg-white/15" />
          <div className="space-y-2 px-1">
            <Skeleton className="h-10 w-full rounded-full bg-white/15" />
            <Skeleton className="h-10 w-full rounded-full bg-white/10" />
            <Skeleton className="h-10 w-full rounded-full bg-white/10" />
            <Skeleton className="h-10 w-full rounded-full bg-white/10" />
            <Skeleton className="h-10 w-full rounded-full bg-white/10" />
          </div>
          <div className="mt-auto">
            <Skeleton className="h-14 w-full rounded-2xl bg-white/10" />
          </div>
        </div>

        {/* Right column: white header + content skeletons */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-16 shrink-0 items-center gap-3 bg-white px-6" style={{ boxShadow: "0 1px 0 var(--card-line)" }}>
            <Skeleton className="h-9 w-80 rounded-full" />
            <div className="ml-auto flex items-center gap-2">
              <Skeleton className="h-9 w-32 rounded-full" />
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-9 w-24 rounded-full" />
            </div>
          </div>
          <div className="flex-1 space-y-5 overflow-hidden p-6 md:p-8">
            <div className="space-y-2">
              <Skeleton className="h-7 w-56 rounded-lg" />
              <Skeleton className="h-4 w-40 rounded-md" />
            </div>
            <Skeleton className="h-24 w-full rounded-[24px]" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-32 rounded-[22px]" />
              <Skeleton className="h-32 rounded-[22px]" />
              <Skeleton className="h-32 rounded-[22px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
