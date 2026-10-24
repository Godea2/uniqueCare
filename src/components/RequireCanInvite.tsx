import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Loading, ErrorState } from "@/components/common";
import type { StaffRole } from "@db/schema";

/** Route guard for User management — RM or anyone with canInviteUsers. */
export default function RequireCanInvite({
  children,
  fallback = "/",
}: {
  children: ReactNode;
  fallback?: string;
}) {
  const meQ = trpc.core.me.useQuery();
  if (meQ.isLoading) return <Loading rows={4} />;
  if (meQ.error) return <ErrorState message={meQ.error.message} onRetry={() => meQ.refetch()} />;
  const real = (meQ.data?.homeRole ?? meQ.data?.role) as StaffRole | undefined;
  const ok = real === "super_admin" || !!meQ.data?.canInviteUsers;
  if (!ok) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
