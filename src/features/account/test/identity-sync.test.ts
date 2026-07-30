import { describe, expect, it } from "vitest";
import { shouldSyncIdentity } from "../identity-sync";

/**
 * The identity sync ends in `router.refresh()`, which re-runs the whole server
 * tree. Firing it when nothing changed reloads the page under the user, so the
 * rule is pinned here rather than left to a component nobody re-reads.
 */
describe("shouldSyncIdentity", () => {
  it("syncs when a signed-out visitor signs in and the server hasn't linked them", () => {
    expect(
      shouldSyncIdentity({ previousSignedIn: false, isSignedIn: true, linked: false })
    ).toBe(true);
  });

  it("stays put on the first settled reading — that's the render we already have", () => {
    for (const isSignedIn of [true, false]) {
      for (const linked of [true, false]) {
        expect(shouldSyncIdentity({ previousSignedIn: null, isSignedIn, linked })).toBe(false);
      }
    }
  });

  it("stays put when Clerk re-reads the same signed-in session", () => {
    // What a backgrounded tab coming back looks like: the session is refreshed,
    // the reading is unchanged, and the page must not reload.
    expect(shouldSyncIdentity({ previousSignedIn: true, isSignedIn: true, linked: false })).toBe(
      false
    );
    expect(shouldSyncIdentity({ previousSignedIn: true, isSignedIn: true, linked: true })).toBe(
      false
    );
  });

  it("stays put on sign-out, which hard-navigates and reloads on its own", () => {
    expect(shouldSyncIdentity({ previousSignedIn: true, isSignedIn: false, linked: true })).toBe(
      false
    );
  });

  it("stays put when the proxy already linked this identity", () => {
    expect(shouldSyncIdentity({ previousSignedIn: false, isSignedIn: true, linked: true })).toBe(
      false
    );
  });
});
