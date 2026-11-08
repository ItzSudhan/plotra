import nodemailer, { type Transporter } from "nodemailer";

// Email goes out over SMTP, so any mail service works: `SMTP_URL` is its
// address with the login in it, such as smtps://user:password@smtp.example.com:465.

let transport: Transporter | undefined;

/** Whether this server can send email. Without `SMTP_URL` callers log the message instead. */
export const emailConfigured = () => Boolean(process.env.SMTP_URL?.trim());

/** The sender: `EMAIL_FROM`, or the address the server logs in to SMTP with. */
function sender(url: string): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (from) return from;
  const user = decodeURIComponent(new URL(url).username);
  if (!user.includes("@")) throw new Error("Set EMAIL_FROM: the SMTP login isn't an email address.");
  return `Plotra <${user}>`;
}

/** Sends an email through the SMTP server in `SMTP_URL`. Throws when there is none, or when the server refuses it. */
export async function sendEmail(message: { to: string; subject: string; text: string; html: string }) {
  const url = process.env.SMTP_URL?.trim();
  if (!url) throw new Error("Email isn't set up on this server.");
  transport ??= nodemailer.createTransport(url);
  await transport.sendMail({ from: sender(url), ...message });
}
