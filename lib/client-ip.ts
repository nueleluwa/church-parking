import { headers } from "next/headers";

/**
 * The visitor's IP address, or null if the platform doesn't tell us. Vercel
 * sets x-vercel-forwarded-for itself. On a self-hosted server, the proxy in
 * front must set x-real-ip or x-forwarded-for. A null result means "don't
 * rate-limit by address", never "put everyone in one bucket".
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const value =
    h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0];
  const ip = value?.trim();
  return ip ? ip : null;
}
