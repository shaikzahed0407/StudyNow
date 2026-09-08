import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { jwtVerify, SignJWT } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import { createClient } from "@supabase/supabase-js";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId?: string;
  name: string;
  email?: string | null;
  accounts?: string[];
};

export type VerifiedSession = {
  openId: string;
  appId: string;
  name: string;
  email?: string;
  role?: "student" | "teacher" | "admin" | "user";
  accounts: string[];
};

class SDKServer {
  private getSessionSecret() {
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  public parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string; email?: string; accounts?: string[] } = {},
  ): Promise<string> {
    const existingAccounts = options.accounts || [];
    const accounts = Array.from(new Set([openId, ...existingAccounts]));

    return this.signSession(
      {
        openId,
        appId: "studynow",
        name: options.name || "Student",
        email: options.email || null,
        accounts,
      },
      options,
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {},
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId || "studynow",
      name: payload.name,
      email: payload.email,
      accounts: payload.accounts || [payload.openId],
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    tokenValue: string | undefined | null,
  ): Promise<VerifiedSession | null> {
    if (!tokenValue) {
      return null;
    }

    // 1. Try local HMAC verification with app cookie secret
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(tokenValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name, email, accounts } = payload as Record<string, unknown>;

      if (isNonEmptyString(openId)) {
        const accountList = Array.isArray(accounts)
          ? (accounts.filter(isNonEmptyString) as string[])
          : [openId];

        return {
          openId,
          appId: typeof appId === "string" ? appId : "studynow",
          name: typeof name === "string" ? name : "User",
          email: typeof email === "string" ? email : undefined,
          accounts: accountList,
        };
      }
    } catch {
      // Not signed with local secret; check if it's a valid Supabase Auth session token
    }

    // 2. Cryptographic Supabase Auth verification via Supabase client
    if (ENV.supabaseUrl && (ENV.supabaseAnonKey || ENV.supabaseServiceRoleKey)) {
      try {
        const supabase = createClient(
          ENV.supabaseUrl,
          ENV.supabaseServiceRoleKey || ENV.supabaseAnonKey,
          { auth: { persistSession: false } },
        );
        const { data, error } = await supabase.auth.getUser(tokenValue);
        if (!error && data?.user && isNonEmptyString(data.user.id)) {
          const user = data.user;
          const meta = user.user_metadata || {};
          const name =
            (typeof meta.name === "string" && meta.name) ||
            (typeof meta.full_name === "string" && meta.full_name) ||
            (typeof user.email === "string" && user.email.split("@")[0]) ||
            "Student";

          let isGoogle = false;
          if (user.app_metadata?.provider === "google") isGoogle = true;
          if (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes("google")) isGoogle = true;
          if (Array.isArray(user.identities) && user.identities.some((id: any) => id?.provider === "google")) isGoogle = true;

          const openId = isGoogle ? `google_${user.id}` : `supabase_${user.id}`;
          const role =
            meta.role === "teacher"
              ? "teacher"
              : meta.role === "admin"
                ? "admin"
                : "student";

          return {
            openId,
            appId: "supabase",
            name,
            email: user.email,
            role,
            accounts: [openId],
          };
        }
      } catch (err) {
        console.warn("[Auth] Supabase verification failed:", String(err));
      }
    }

    return null;
  }

  /**
   * Switch the active account in a multi-account session.
   * Cryptographically verifies current session and ensures target account exists.
   */
  async switchSessionAccount(
    tokenValue: string | undefined | null,
    targetOpenId: string,
  ): Promise<{ token: string; user: User } | null> {
    const session = await this.verifySession(tokenValue);
    if (!session) return null;

    const targetUser = await db.getUserByOpenId(targetOpenId);
    if (!targetUser) return null;

    // Check if target user is disabled
    if (targetUser.status === "disabled") {
      throw ForbiddenError("This account is disabled.");
    }

    // Ensure target account is tracked in accounts list
    const updatedAccounts = Array.from(new Set([...session.accounts, targetOpenId]));

    const newToken = await this.signSession({
      openId: targetUser.openId,
      appId: "studynow",
      name: targetUser.name || "User",
      email: targetUser.email,
      accounts: updatedAccounts,
    });

    return { token: newToken, user: targetUser };
  }

  async authenticateRequest(req: Request): Promise<User> {
    // 1. Explicit Authorization Bearer header takes precedence (e.g., Supabase Google OAuth)
    let sessionToken: string | undefined;
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      sessionToken = authHeader.slice(7).trim();
    }

    // 2. Fall back to ambient session cookie only if no Authorization header was provided
    if (!sessionToken) {
      const cookies = this.parseCookies(req.headers.cookie);
      sessionToken = cookies.get(COOKIE_NAME);
    }

    const session = await this.verifySession(sessionToken);

    if (!session) {
      throw ForbiddenError("Invalid or expired session");
    }

    const sessionUserId = session.openId;
    const signedInAt = new Date();
    let user = await db.getUserByOpenId(sessionUserId);

    if (!user && session.email) {
      // Check if user already exists with this email
      const existingByEmail = await db.getUserByEmail(session.email);
      if (existingByEmail) {
        user = existingByEmail;
      }
    }

    if (!user) {
      // Auto-provision user from verified session metadata (e.g. Google OAuth or Supabase email login)
      await db.upsertUser({
        openId: session.openId,
        name: session.name || "Student",
        email: session.email || null,
        role: session.role || "student",
        status: "active",
        teacherApproval: session.role === "teacher" ? "pending" : "approved",
        loginMethod: session.appId === "supabase" ? "supabase" : "local",
        lastSignedIn: signedInAt,
      });
      user = await db.getUserByOpenId(session.openId);
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    await db.upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt,
    });

    return user;
  }
}

export const sdk = new SDKServer();
