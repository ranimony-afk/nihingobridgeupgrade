import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { generateOpaqueToken, hashToken } from "@/lib/auth/crypto";

const ISSUER = "NihongoBridge";
const RECOVERY_CODE_COUNT = 10;

export async function createTotpEnrollment(email: string) {
  const secret = generateSecret();
  const uri = generateURI({
    issuer: ISSUER,
    label: email,
    secret,
    algorithm: "sha1",
    digits: 6,
    period: 30,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(uri, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
  });

  return { secret, uri, qrCodeDataUrl };
}

export async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
  const result = await verify({
    secret,
    token: code.replace(/\s/g, ""),
    digits: 6,
    period: 30,
    epochTolerance: 30,
  });

  return result.valid;
}

export function currentTotpStep(): number {
  return Math.floor(Date.now() / 1_000 / 30);
}

export function createRecoveryCodes(): { plainCodes: string[]; hashes: string[] } {
  const plainCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const token = generateOpaqueToken(9).toUpperCase();
    return `${token.slice(0, 5)}-${token.slice(5, 10)}-${token.slice(10, 15)}`;
  });

  return {
    plainCodes,
    hashes: plainCodes.map((code) => hashToken(normalizeRecoveryCode(code))),
  };
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
