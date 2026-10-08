import { describe, expect, it } from "vitest";
import {
  DISPLAY_DEV_BUILD_ID,
  DISPLAY_RELOAD_COOLDOWN_MS,
  displayBuildId,
  displayNeedsReload,
  payloadBuildId,
  toPublicDisplayPayload,
} from "../lib/display";

describe("displayBuildId", () => {
  it("prefers the git commit, then the deployment id, then the dev constant", () => {
    expect(displayBuildId({
      VERCEL_GIT_COMMIT_SHA: "abc123",
      VERCEL_DEPLOYMENT_ID: "dpl_9",
    })).toBe("abc123");
    expect(displayBuildId({ VERCEL_DEPLOYMENT_ID: "dpl_9" })).toBe("dpl_9");
    expect(displayBuildId({})).toBe(DISPLAY_DEV_BUILD_ID);
  });

  it("strips characters that do not belong in a build id", () => {
    expect(displayBuildId({ VERCEL_GIT_COMMIT_SHA: "  sha/../x y! " })).toBe("sha..xy");
    expect(displayBuildId({ VERCEL_GIT_COMMIT_SHA: "   " })).toBe(DISPLAY_DEV_BUILD_ID);
  });
});

describe("payloadBuildId", () => {
  it("keeps a build id that arrived on the payload", () => {
    expect(payloadBuildId("release-1")).toBe("release-1");
  });

  it("fills a missing build id from the environment", () => {
    expect(payloadBuildId(undefined)).toBe(displayBuildId());
    expect(payloadBuildId(12)).toBe(displayBuildId());
  });
});

describe("toPublicDisplayPayload build id", () => {
  it("preserves the server build id and does not replace it on the client", () => {
    const payload = toPublicDisplayPayload({
      mode: "studio_active",
      theme: "yours-clean",
      refreshSeconds: 30,
      buildId: "deploy-sha",
      data: { firstName: "Alex" },
    });
    expect(payload.buildId).toBe("deploy-sha");
    expect(payload.theme).toBe("crt-green");
  });
});

describe("displayNeedsReload", () => {
  const now = 1_700_000_000_000;

  it("reloads when the payload was built by a newer deploy", () => {
    expect(displayNeedsReload({
      loadedBuildId: "old",
      payloadBuildId: "new",
      mode: "studio_active",
      now,
    })).toBe(true);
  });

  it("stays put when the build id matches", () => {
    expect(displayNeedsReload({
      loadedBuildId: "same",
      payloadBuildId: "same",
      mode: "idle",
      now,
    })).toBe(false);
  });

  it("reloads for a mode this bundle does not know", () => {
    expect(displayNeedsReload({
      loadedBuildId: "same",
      payloadBuildId: "same",
      mode: "studio_future",
      now,
    })).toBe(true);
  });

  it("does not treat a missing build id as a new deploy", () => {
    expect(displayNeedsReload({
      loadedBuildId: "same",
      payloadBuildId: "",
      mode: "idle",
      now,
    })).toBe(false);
    expect(displayNeedsReload({
      loadedBuildId: "same",
      mode: "studio_welcome",
      now,
    })).toBe(false);
  });

  it("waits out the cooldown, then allows another reload", () => {
    expect(displayNeedsReload({
      loadedBuildId: "old",
      payloadBuildId: "new",
      mode: "studio_active",
      now,
      lastReloadAt: now - DISPLAY_RELOAD_COOLDOWN_MS + 1,
    })).toBe(false);
    expect(displayNeedsReload({
      loadedBuildId: "old",
      payloadBuildId: "new",
      mode: "studio_future",
      now,
      lastReloadAt: now - 1_000,
    })).toBe(false);
    expect(displayNeedsReload({
      loadedBuildId: "old",
      payloadBuildId: "new",
      mode: "studio_active",
      now,
      lastReloadAt: now - DISPLAY_RELOAD_COOLDOWN_MS,
    })).toBe(true);
  });
});
