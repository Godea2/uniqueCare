import { Skeleton } from "./ui/skeleton";

export function AuthLayoutSkeleton() {
  return (
    <div className="flex min-h-screen w-full bg-[--app-bg]">
      <div className="uc-frame flex min-h-screen w-full">
        <div className="uc-sidebar hidden w-[17.75rem] shrink-0 flex-col p-4 md:flex">
          <Skeleton className="mb-6 h-8 w-36 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
          <div className="mt-auto">
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="uc-topbar flex h-[3.75rem] shrink-0 items-center gap-3 px-6">
            <Skeleton className="h-9 w-80 rounded-xl" />
            <div className="ml-auto flex items-center gap-2">
              <Skeleton className="h-9 w-32 rounded-xl" />
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-9 w-24 rounded-xl" />
            </div>
          </div>
          <div className="uc-canvas flex-1 space-y-5 overflow-hidden p-6 md:p-8">
            <Skeleton className="h-48 w-full rounded-[20px]" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
              <Skeleton className="h-32 rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
