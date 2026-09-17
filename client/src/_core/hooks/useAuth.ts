import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

let isLoggingOut = false;

function clearAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("studynow-token");
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("sb-") || key.includes("supabase.auth"))) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}

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

  const exchangeSupabaseMutation = trpc.auth.exchangeSupabase.useMutation();

  // Handle Supabase OAuth hash and session tokens
  useEffect(() => {
    let mounted = true;

    if (isLoggingOut) {
      setOauthChecking(false);
      return;
    }

    // 1. Direct hash extraction for instantaneous response
    if (typeof window !== "undefined" && window.location.hash.includes("access_token=")) {
      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const token = hashParams.get("access_token");
        if (token) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          exchangeSupabaseMutation
            .mutateAsync({ supabaseToken: token })
            .then((res) => {
              if (!mounted || isLoggingOut) return;
              if (res?.token) {
                isLoggingOut = false;
                sessionStorage.setItem("studynow-token", res.token);
                utils.auth.me.setData(undefined, res.user as any);
              }
            })
            .catch((err) => {
              console.warn("Failed to exchange Supabase OAuth token:", err);
            })
            .finally(() => {
              if (mounted) {
                setOauthChecking(false);
                utils.auth.me.invalidate();
                utils.auth.listAccounts.invalidate();
              }
            });
          return;
        }
      } catch {}
      setOauthChecking(false);
    }

    // 2. Supabase auth session retrieval & state listener
    if (supabase) {
      // Check existing session persisted by Supabase in localStorage only if no active StudyNow session
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!mounted || isLoggingOut) return;
        const currentToken = sessionStorage.getItem("studynow-token");
        if (session?.access_token && !currentToken) {
          exchangeSupabaseMutation
            .mutateAsync({ supabaseToken: session.access_token })
            .then((res) => {
              if (!mounted || isLoggingOut) return;
              if (res?.token) {
                isLoggingOut = false;
                sessionStorage.setItem("studynow-token", res.token);
                utils.auth.me.setData(undefined, res.user as any);
                utils.auth.me.invalidate();
                utils.auth.listAccounts.invalidate();
              }
            })
            .catch(() => {})
            .finally(() => {
              if (mounted) setOauthChecking(false);
            });
        } else {
          setOauthChecking(false);
        }
      }).catch(() => {
        if (mounted) setOauthChecking(false);
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted || isLoggingOut) return;
        const currentToken = sessionStorage.getItem("studynow-token");
        if (session?.access_token && !currentToken) {
          try {
            const res = await exchangeSupabaseMutation.mutateAsync({ supabaseToken: session.access_token });
            if (res?.token && mounted && !isLoggingOut) {
              isLoggingOut = false;
              sessionStorage.setItem("studynow-token", res.token);
              utils.auth.me.setData(undefined, res.user as any);
              await utils.auth.me.invalidate();
              await utils.auth.listAccounts.invalidate();
            }
          } catch {}
        } else if (event === "SIGNED_OUT") {
          clearAuthStorage();
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
    isLoggingOut = true;
    try {
      clearAuthStorage();
      utils.auth.me.setData(undefined, null);

      if (supabase) {
        await supabase.auth.signOut().catch(() => {});
      }
      await logoutMutation.mutateAsync().catch(() => {});
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      clearAuthStorage();
      utils.auth.me.setData(undefined, null);
      utils.auth.me.reset();
      utils.auth.listAccounts.reset();

      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    return {
      user: isLoggingOut ? null : (meQuery.data ?? null),
      loading: isLoggingOut ? true : (oauthChecking || meQuery.isLoading || logoutMutation.isPending),
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: isLoggingOut ? false : Boolean(meQuery.data),
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
