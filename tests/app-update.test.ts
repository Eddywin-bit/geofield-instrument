import { beforeEach, expect, mock, test } from "bun:test";

let progress: (event: { url: string; bytes: number; contentLength: number }) => void;
const remove = mock(async () => {});
const install = mock(async () => ({ status: "installing" }));
const downloadFile = mock(async ({ url }: { url: string }) => {
  progress({ url, bytes: 100, contentLength: 100 });
  return { path: "/cache/geofield-update.apk" };
});
const stat = mock(async () => ({ size: 100 }));
const deleteFile = mock(async () => {});

mock.module("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
  registerPlugin: () => ({ install }),
}));
mock.module("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Filesystem: {
    downloadFile,
    stat,
    deleteFile,
    addListener: async (_: string, listener: typeof progress) => {
      progress = listener;
      return { remove };
    },
  },
}));

const { downloadUpdate, updateController } = await import("../src/lib/app-update");

beforeEach(() => {
  for (const fn of [remove, install, downloadFile, stat, deleteFile]) fn.mockClear();
});

test("native download reports progress and removes its listener", async () => {
  const report = mock(() => {});
  await expect(downloadUpdate("https://example.com/progress.apk", report)).resolves.toBe(
    "geofield-update.apk",
  );
  expect(downloadFile.mock.calls[0][0]).toMatchObject({ directory: "CACHE", progress: true });
  expect(report.mock.calls.map((call) => call[0])).toEqual([99, 100]);
  expect(remove).toHaveBeenCalledTimes(1);
});

test("incomplete native download is deleted and never installed", async () => {
  stat.mockResolvedValueOnce({ size: 50 });
  await updateController.run("https://example.com/incomplete.apk");
  expect(updateController.getSnapshot().phase).toBe("error");
  expect(install).not.toHaveBeenCalled();
  expect(deleteFile).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
});

test("permission and cancelled-installer retries reuse the downloaded APK", async () => {
  install.mockResolvedValueOnce({ status: "needs-permission" });
  const url = "https://example.com/permission.apk";
  await updateController.run(url);
  expect(updateController.getSnapshot().phase).toBe("needs-permission");
  await updateController.run(url);
  await updateController.run(url);
  expect(downloadFile).toHaveBeenCalledTimes(1);
  expect(install).toHaveBeenCalledTimes(3);
  expect(updateController.getSnapshot().phase).toBe("installing");
});

test("installer rejection exposes its error and discards the cached download", async () => {
  install.mockRejectedValueOnce(new Error("The downloaded update is invalid."));
  const url = "https://example.com/invalid.apk";
  await updateController.run(url);
  expect(updateController.getSnapshot().error).toBe("The downloaded update is invalid.");
  await updateController.run(url);
  expect(downloadFile).toHaveBeenCalledTimes(2);
  expect(updateController.getSnapshot().phase).toBe("installing");
});
