import { describe, expect, it, vi } from "vitest";
import { sdk } from "./_core/sdk";
import type { Request } from "express";
import { COOKIE_NAME } from "../shared/const";

describe("Unified Session & Multi-Account Switching", () => {
  it("resolves active token from Authorization Bearer header or cookies", () => {
    const reqWithBearer = {
      headers: { authorization: "Bearer my-token-123" },
    } as Request;
    expect(sdk.getActiveToken(reqWithBearer)).toBe("my-token-123");

    const reqWithCookie = {
      headers: { cookie: `${COOKIE_NAME}=my-cookie-456; other=abc` },
    } as Request;
    expect(sdk.getActiveToken(reqWithCookie)).toBe("my-cookie-456");

    const reqEmpty = { headers: {} } as Request;
    expect(sdk.getActiveToken(reqEmpty)).toBeUndefined();
  });

  it("creates session tokens that preserve multiple connected accounts", async () => {
    const token = await sdk.createSessionToken("google_haise", {
      name: "Haise",
      email: "haise@example.com",
      accounts: ["demo_admin", "demo_student"],
    });

    const verified = await sdk.verifySession(token);
    expect(verified).not.toBeNull();
    expect(verified?.openId).toBe("google_haise");
    expect(verified?.accounts).toContain("google_haise");
    expect(verified?.accounts).toContain("demo_admin");
    expect(verified?.accounts).toContain("demo_student");
  });

  it("switches session to a target account and keeps all connected accounts in the session", async () => {
    vi.spyOn(await import("./db"), "getUserByOpenId").mockImplementation(async (openId: string) => {
      if (openId === "demo_admin") {
        return {
          id: 99,
          openId: "demo_admin",
          name: "Demo Admin",
          email: "admin@studynow.dev",
          avatarUrl: null,
          bio: null,
          externalLinks: null,
          loginMethod: "local",
          role: "admin",
          status: "active",
          teacherApproval: "approved",
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        };
      }
      return undefined;
    });

    const initialToken = await sdk.createSessionToken("google_haise", {
      name: "Haise",
      email: "haise@example.com",
      accounts: ["google_haise", "demo_student"],
    });

    const switched = await sdk.switchSessionAccount(initialToken, "demo_admin");
    expect(switched).not.toBeNull();
    expect(switched?.user.openId).toBe("demo_admin");

    const verifiedSwitched = await sdk.verifySession(switched?.token);
    expect(verifiedSwitched?.openId).toBe("demo_admin");
    expect(verifiedSwitched?.accounts).toContain("google_haise");
    expect(verifiedSwitched?.accounts).toContain("demo_student");
    expect(verifiedSwitched?.accounts).toContain("demo_admin");
  });
});
