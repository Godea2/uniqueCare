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

  const accessToken = session?.accessToken ?? "";

  const { data: user, isLoading, error, refetch } = trpc.auth.me.useQuery(undefined, {
    enabled: !!session?.accessToken,
    // Never reuse a previous UNAUTHORIZED / user payload across logins.
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: "always",
    refetchOnReconnect: "always",
  });

  // When the access token changes (fresh sign-in), drop any cached auth failure.
  useEffect(() => {
    if (!accessToken) return;
    void utils.auth.me.invalidate();
  }, [accessToken, utils]);

  useEffect(() => {
    if (session && error?.data?.code === "UNAUTHORIZED") {
      writeSession(null);
      void utils.auth.me.reset();
    }
  }, [session, error, utils]);

  const logout = useCallback(() => {
    writeSession(null);
    void utils.invalidate();
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
