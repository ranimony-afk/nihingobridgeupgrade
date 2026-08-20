export type EdgeClaims = { role: string; plan: string };

function jwtSecret() {
  return process.env.AUTH_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.DATABASE_URL || "nihongo-bridge-dev";
}

function bytesToB64url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function verifyJwtEdge(token: string | undefined | null): Promise<EdgeClaims | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(jwtSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = bytesToB64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${body}`)));
  if (expected !== sig) return null;
  try {
    const json = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: number;
      role?: string;
      plan?: string;
      typ?: string;
    };
    if ((json.exp ?? 0) < Math.floor(Date.now() / 1000)) return null;
    if (json.typ !== "access") return null;
    return { role: json.role ?? "", plan: json.plan ?? "free" };
  } catch {
    return null;
  }
}
