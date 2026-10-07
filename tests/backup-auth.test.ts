import { beforeEach, expect, mock, test } from "bun:test";

const initialize = mock(async () => {});
const getAuthorizationCode = mock(async (): Promise<{ accessToken?: string }> => {
  throw new Error("No saved session");
});
const login = mock(async () => ({
  result: {
    responseType: "online",
    accessToken: { token: "test-backup-token" },
    profile: { email: "test@example.com" },
  },
}));
mock.module("@capgo/capacitor-social-login", () => ({
  SocialLogin: { initialize, getAuthorizationCode, login },
}));

const { signInAndGetToken } = await import("../src/lib/backup-auth");

beforeEach(() => {
  initialize.mockClear();
  getAuthorizationCode.mockClear();
  login.mockClear();
});

test("checking then restoring reuses the validated Google session", async () => {
  getAuthorizationCode.mockRejectedValueOnce(new Error("No saved session"));
  getAuthorizationCode.mockResolvedValueOnce({ accessToken: "test-backup-token" });
  const checked = await signInAndGetToken();
  const restored = await signInAndGetToken();
  expect(checked.accessToken).toBe(restored.accessToken);
  expect(login).toHaveBeenCalledTimes(1);
});

test("a valid saved session does not open the Google account picker", async () => {
  getAuthorizationCode.mockResolvedValueOnce({ accessToken: "test-saved-token" });
  expect((await signInAndGetToken()).accessToken).toBe("test-saved-token");
  expect(login).not.toHaveBeenCalled();
});

test("expired or missing sessions use the existing Drive-scoped sign-in", async () => {
  await signInAndGetToken();
  expect(login).toHaveBeenCalledTimes(1);
  expect(login.mock.calls[0][0]).toMatchObject({
    provider: "google",
    options: { scopes: expect.arrayContaining(["https://www.googleapis.com/auth/drive.file"]) },
  });
});

test("overlapping backup operations share one Google sign-in", async () => {
  const [first, second] = await Promise.all([signInAndGetToken(), signInAndGetToken()]);
  expect(first.accessToken).toBe(second.accessToken);
  expect(login).toHaveBeenCalledTimes(1);
});

test("cancelled sign-in is not cached and can be retried", async () => {
  login.mockRejectedValueOnce(new Error("Sign-in cancelled"));
  await expect(signInAndGetToken()).rejects.toThrow("Sign-in cancelled");
  await expect(signInAndGetToken()).resolves.toMatchObject({ accessToken: "test-backup-token" });
  expect(login).toHaveBeenCalledTimes(2);
});
