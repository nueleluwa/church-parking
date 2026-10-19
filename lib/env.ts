import { z } from "zod";
import { readQrFlow, type QrFlowConfig } from "@/lib/rules/qr-flow";

const serverEnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  APP_URL: z.url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Which car parks use the QR check-in. Read from QR_SESSION_FLOW and QR_SESSION_AREAS every time (not cached), and never
 * able to stop the app: anything unrecognised means off. See lib/rules/qr-flow.ts.
 */
export function qrFlowConfig(): QrFlowConfig {
  return readQrFlow(process.env);
}

/** Server-only settings, checked once. Never import this from client code. */
export function serverEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse(process.env);
  return cached;
}
