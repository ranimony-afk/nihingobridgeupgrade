import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { env } from "@/lib/env";

const MFA_AAD = Buffer.from("nihongobridge:mfa:v1");

export function generateOpaqueToken(byteLength = 48): string {
  return randomBytes(byteLength).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function mfaKey(): Buffer {
  return createHash("sha256")
    .update(env.MFA_ENCRYPTION_KEY ?? env.AUTH_SECRET ?? "")
    .digest();
}

export function encryptMfaSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", mfaKey(), iv);
  cipher.setAAD(MFA_AAD);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptMfaSecret(payload: string): string {
  const [encodedIv, encodedTag, encodedCiphertext] = payload.split(".");
  if (!encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error("Invalid encrypted MFA secret format.");
  }

  const decipher = createDecipheriv("aes-256-gcm", mfaKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAAD(MFA_AAD);
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
