import "server-only";

import { Resend } from "resend";
import { env, isFeatureConfigured } from "@/lib/env";
import { reportException } from "@/lib/observability";

let resendClient: Resend | undefined;

type AccountEmailKind = "verify_email" | "password_reset";

function getResendClient(): Resend {
  if (!isFeatureConfigured("email")) {
    throw new Error("Transactional email is unavailable. Configure RESEND_API_KEY and EMAIL_FROM.");
  }

  resendClient ??= new Resend(env.RESEND_API_KEY!);
  return resendClient;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character]!;
  });
}

function emailContent(kind: AccountEmailKind, actionUrl: string) {
  const title = kind === "verify_email" ? "Verify your NihongoBridge email" : "Reset your NihongoBridge password";
  const description = kind === "verify_email"
    ? "Confirm your email address to activate password sign-in and protect your learning progress."
    : "Use this secure link to choose a new password. Your existing web sessions will be signed out when the password changes.";
  const actionLabel = kind === "verify_email" ? "Verify email" : "Reset password";

  const safeUrl = escapeHtml(actionUrl);
  return {
    subject: title,
    text: `${description}\n\n${actionLabel}: ${actionUrl}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `<!doctype html><html><body style="margin:0;background:#f2f4ed;color:#18231d;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border-radius:18px"><p style="margin:0 0 16px;color:#277a5c;font-weight:700;letter-spacing:.08em">NIHONGOBRIDGE</p><h1 style="font-family:Georgia,serif;font-weight:400">${title}</h1><p style="line-height:1.6">${description}</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#277a5c;color:#fff;text-decoration:none;font-weight:700">${actionLabel}</a></p><p style="color:#657166;font-size:13px;line-height:1.5">If the button does not work, copy this link into your browser:<br><a href="${safeUrl}">${safeUrl}</a></p><p style="color:#657166;font-size:13px">If you did not request this, you can safely ignore this email.</p></main></body></html>`,
  };
}

export async function sendAccountActionEmail(
  recipient: string,
  kind: AccountEmailKind,
  actionUrl: string,
): Promise<void> {
  const content = emailContent(kind, actionUrl);

  try {
    const { error } = await getResendClient().emails.send({
      from: env.EMAIL_FROM!,
      to: [recipient],
      subject: content.subject,
      text: content.text,
      html: content.html,
    });

    if (error) throw new Error(error.message);
  } catch (error) {
    reportException(error, { component: "auth-email", kind }, "Transactional authentication email failed");
    throw new Error("Unable to deliver the authentication email.");
  }
}
