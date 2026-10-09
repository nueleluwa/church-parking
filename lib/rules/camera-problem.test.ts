import { describe, expect, test } from "vitest";
import { describeCameraProblem } from "./camera-problem";

const named = (name: string, message = "") => Object.assign(new Error(message), { name });

describe("describeCameraProblem", () => {
  test("a page that is not secure cannot use the camera, whatever the error was", () => {
    expect(describeCameraProblem(named("NotAllowedError"), false).kind).toBe("insecure");
    expect(describeCameraProblem("Camera streaming not supported by the browser.", false).message).toContain("https");
  });

  test("permission refused, in the ways browsers say it", () => {
    expect(describeCameraProblem(named("NotAllowedError", "Permission denied"), true).kind).toBe("denied");
    expect(describeCameraProblem("NotAllowedError: Permission dismissed", true).kind).toBe("denied");
    expect(describeCameraProblem(named("SecurityError", "Permission denied by system"), true).kind).toBe("denied");
    expect(describeCameraProblem(named("NotAllowedError"), true).message).toContain("Try again");
  });

  test("no camera on the device", () => {
    expect(describeCameraProblem(named("NotFoundError", "Requested device not found"), true).kind).toBe("none");
    expect(describeCameraProblem("Error getting userMedia, error = NotFoundError: Requested device not found", true).kind).toBe("none");
  });

  test("a camera another app is using", () => {
    expect(describeCameraProblem(named("NotReadableError", "Could not start video source"), true).kind).toBe("busy");
  });

  test("anything else still gets a plain message and a way forward", () => {
    const p = describeCameraProblem(undefined, true);
    expect(p.kind).toBe("other");
    expect(p.message).toContain("Try again");
    expect(describeCameraProblem({ weird: true }, true).kind).toBe("other");
  });
});
