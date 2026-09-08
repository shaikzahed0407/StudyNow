import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/" } = options ?? {};
  const utils = trpc.useUtils();
  const [oauthChecking, setOauthChecking] = useState<boolean>(() => {
    if (
      typeof window !== "undefined" &&
      (window.location.hash.includes("access_token=") ||
        window.location.search.includes("code=") ||
        window.location.hash.includes("code="))
    ) {
      return true;
    }
    return false;
  });

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    enabled: !oauthChecking,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  // Handle Supabase OAuth hash and session tokens
  useEffect(() => {
    let mounted = true;

    // 1. Direct hash extraction for instantaneous response
    if (typeof window !== "undefined" && window.location.hash.includes("access_token=")) {
      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const token = hashParams.get("access_token");
        if (token) {
          sessionStorage.setItem("studynow-token", token);
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      } catch {}
      setOauthChecking(false);
      utils.auth.me.invalidate();
    }

    // 2. Supabase auth session retrieval & state listener
    if (supabase) {
      // Check existing session persisted by Supabase in localStorage
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!mounted) return;
        if (session?.access_token) {
          const currentToken = sessionStorage.getItem("studynow-token");
          if (currentToken !== session.access_token) {
            sessionStorage.setItem("studynow-token", session.access_token);
            utils.auth.me.invalidate();
          }
        }
        setOauthChecking(false);
      }).catch(() => {
        if (mounted) setOauthChecking(false);
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return;
        if (session?.access_token) {
          sessionStorage.setItem("studynow-token", session.access_token);
          await utils.auth.me.invalidate();
        } else if (event === "SIGNED_OUT") {
          sessionStorage.removeItem("studynow-token");
          utils.auth.me.setData(undefined, null);
          await utils.auth.me.invalidate();
        }
        setOauthChecking(false);
      });

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    } else {
      setOauthChecking(false);
    }
  }, [utils]);

  const logout = useCallback(async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut().catch(() => {});
      }
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      try {
        sessionStorage.removeItem("studynow-token");
      } catch {}
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: oauthChecking || meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    oauthChecking,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (oauthChecking || meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    oauthChecking,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
