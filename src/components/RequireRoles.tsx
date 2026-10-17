import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { Loading, ErrorState } from "@/components/common";
import type { StaffRole } from "@db/schema";
import { roleAllowed } from "@/lib/roles";

/**
 * Route guard — redirects to home when the acting role is not allowed.
 * Uses acting role (not homeRole) so "view as" carer preview cannot open admin screens.
 */
export default function RequireRoles({
  roles,
  children,
  fallback = "/",
}: {
  roles: StaffRole[];
  children: ReactNode;
  fallback?: string;
}) {
  const meQ = trpc.core.me.useQuery();
  if (meQ.isLoading) return <Loading rows={4} />;
  if (meQ.error) return <ErrorState message={meQ.error.message} onRetry={() => meQ.refetch()} />;
  const role = meQ.data?.role;
  if (!roleAllowed(role, roles)) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
