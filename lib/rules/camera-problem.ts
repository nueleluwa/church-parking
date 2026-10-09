/**
 * Why a camera would not start, in words a driver can act on. The browser reports these in different ways (an
 * error object, or just text), so this looks at the name and the words and falls back to a general message.
 */
export type CameraProblem = {
  kind: "insecure" | "denied" | "none" | "busy" | "other";
  message: string;
};

export function describeCameraProblem(error: unknown, secure: boolean): CameraProblem {
  if (!secure) {
    return { kind: "insecure", message: "The camera only works on a secure (https) address. Please open the site at its https address." };
  }
  const text = [
    typeof error === "string" ? error : "",
    error instanceof Error ? `${error.name} ${error.message}` : "",
    typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "",
  ]
    .join(" ")
    .toLowerCase();

  if (/notallowed|permission|denied|dismissed/.test(text)) {
    return {
      kind: "denied",
      message: "Camera access is blocked. Allow the camera for this site in your browser settings, then tap Try again.",
    };
  }
  if (/notfound|no camera|devicesnotfound|requested device not found|overconstrained/.test(text)) {
    return { kind: "none", message: "We could not find a camera on this device." };
  }
  if (/notreadable|trackstart|in use|busy|could not start video/.test(text)) {
    return {
      kind: "busy",
      message: "Another app seems to be using the camera. Close it, then tap Try again.",
    };
  }
  return { kind: "other", message: "We could not start the camera. Tap Try again." };
}
