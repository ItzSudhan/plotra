import "server-only";
import { emailConfigured, sendEmail as send } from "@plotra/auth/email";

const appUrl = () => (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** An absolute link into the app, for emails. */
export const appLink = (path: string) => `${appUrl()}${path.startsWith("/") ? path : `/${path}`}`;

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Sends an email over SMTP when SMTP_URL is set; otherwise logs it, so local
 * development works without a mail server (plan.md 1 "Email").
 */
export async function sendEmail(message: { to: string; subject: string; text: string; html: string }) {
  if (!emailConfigured()) {
    console.log(`[plotra] Email to ${message.to}: ${message.subject}\n${message.text}`);
    return;
  }
  await send(message);
}
