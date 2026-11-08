// GET /api/github/linked: where Better Auth sends the popup after someone links
// their GitHub account from Project settings → GitHub (`?error=` when it
// didn't work). Tells the settings window, over a BroadcastChannel since the
// popup may have lost its opener, and closes.

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const failures: Record<string, string> = {
  account_already_linked_to_different_user: "That GitHub account is already connected to another Plotra account.",
  "email_doesn't_match": "GitHub wasn't connected: its email doesn't match.",
  unable_to_link_account: "GitHub wasn't connected. Check that your GitHub email is verified, then try again.",
  access_denied: "GitHub wasn't connected.",
};

export function GET(request: Request) {
  const error = new URL(request.url).searchParams.get("error");
  const ok = !error;
  const message = ok ? "GitHub is connected. You can close this window." : (failures[error.toLowerCase()] ?? "Couldn't connect GitHub. Close this window and try again.");
  const payload = JSON.stringify({ ok, message }).replace(/</g, "\\u003c");
  const html = `<!doctype html><meta charset="utf-8"><title>GitHub · Plotra</title>
<body style="font:15px system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#444">
<p>${escapeHtml(message)}</p>
<script>
try { const c = new BroadcastChannel("plotra-github"); c.postMessage(${payload}); c.close(); } catch {}
setTimeout(() => window.close(), ${ok ? 300 : 5000});
</script></body>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
