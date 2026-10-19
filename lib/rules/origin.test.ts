import { describe, expect, test } from "vitest";
import { isSameOrigin } from "./origin";

describe("isSameOrigin", () => {
  test("accepts the site's own origin, with or without a port", () => {
    expect(isSameOrigin("https://churchparking.online", "churchparking.online", null)).toBe(true);
    expect(isSameOrigin("http://localhost:3457", "localhost:3457", null)).toBe(true);
    expect(isSameOrigin("HTTPS://ChurchParking.Online", "churchparking.online", null)).toBe(true);
  });

  test("behind a proxy it compares with the host the browser used", () => {
    expect(isSameOrigin("https://churchparking.online", "127.0.0.1:3000", "churchparking.online")).toBe(true);
    expect(isSameOrigin("https://churchparking.online", "127.0.0.1:3000", "churchparking.online, other.example")).toBe(true);
    expect(isSameOrigin("https://churchparking.online", "127.0.0.1:3000", null)).toBe(false);
  });

  test("a request with no Origin header is refused, unlike Next's own check", () => {
    expect(isSameOrigin(null, "churchparking.online", null)).toBe(false);
    expect(isSameOrigin("", "churchparking.online", null)).toBe(false);
  });

  test.each([
    "https://evil.example",
    "https://churchparking.online.evil.example",
    "https://evilchurchparking.online",
    "https://churchparking.online:8443",
    "null",
    "not a url",
  ])("refuses another site: %s", (origin) => {
    expect(isSameOrigin(origin, "churchparking.online", null)).toBe(false);
  });

  test("refuses when the site's own host is unknown", () => {
    expect(isSameOrigin("https://churchparking.online", null, null)).toBe(false);
  });
});
