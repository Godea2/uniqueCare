import { trpc } from "@/providers/trpc";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { LOGIN_PATH } from "@/const";
import { readSession, writeSession, type AuthSession } from "@/lib/session";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = LOGIN_PATH } = options ?? {};
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [session, setSession] = useState<AuthSession | null>(() => readSession());

  useEffect(() => {
    const sync = () => setSession(readSession());
    window.addEventListener("uc-auth-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("uc-auth-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const { data: user, isLoading, error, refetch } = trpc.auth.me.useQuery(undefined, {
    enabled: !!session,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  useEffect(() => {
    if (session && error?.data?.code === "UNAUTHORIZED") {
      writeSession(null);
    }
  }, [session, error]);

  const logout = useCallback(() => {
    writeSession(null);
    utils.invalidate();
    navigate(redirectPath);
  }, [navigate, redirectPath, utils]);

  useEffect(() => {
    if (redirectOnUnauthenticated && !session) {
      const currentPath = window.location.pathname;
      if (currentPath !== redirectPath) navigate(redirectPath);
    }
  }, [redirectOnUnauthenticated, session, navigate, redirectPath]);

  return useMemo(
    () => ({
      user: user ?? null,
      isAuthenticated: !!user,
      isLoading: !!session && isLoading,
      error,
      logout,
      refresh: refetch,
    }),
    [user, session, isLoading, error, logout, refetch],
  );
}
