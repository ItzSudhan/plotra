// A link to a new GitHub bug report (.github/ISSUE_TEMPLATE/bug_report.yml),
// with what the app knows already filled in: the browser, and the commit or
// date. Nothing from the project goes into it. GitHub needs an account, so the
// same report can go by email instead.

const NEW_ISSUE = "https://github.com/ItzSudhan/plotra/issues/new";
const SUPPORT_EMAIL = "sudhan@plotra.ink";

// Order matters: Edge's user agent also names Chrome, and Chrome's names Safari.
const BROWSERS: [string, RegExp][] = [
  ["Edge", /Edg\/(\d+)/],
  ["Firefox", /Firefox\/(\d+)/],
  ["Chrome", /Chrome\/(\d+)/],
  ["Safari", /Version\/(\d+)[\d.]* .*Safari/],
];
const SYSTEMS: [string, RegExp][] = [
  ["iOS", /iPhone|iPad/],
  ["Android", /Android/],
  ["macOS", /Mac OS X/],
  ["Windows", /Windows/],
  ["Linux", /Linux/],
];

/** "Firefox 143 on macOS", from the user agent; the raw string when it can't be read. */
export function describeBrowser(userAgent: string): string {
  let browser: string | null = null;
  for (const [name, pattern] of BROWSERS) {
    const version = pattern.exec(userAgent)?.[1];
    if (version) {
      browser = `${name} ${version}`;
      break;
    }
  }
  if (!browser) return userAgent.slice(0, 200);
  const os = SYSTEMS.find(([, pattern]) => pattern.test(userAgent))?.[0];
  return os ? `${browser} on ${os}` : browser;
}

type Context = { userAgent: string; commit?: string; today: Date };

const versionOf = ({ commit, today }: Context) => (commit ? `${commit} (${today.toISOString().slice(0, 10)})` : today.toISOString().slice(0, 10));

export function bugReportUrl(context: Context): string {
  const params = new URLSearchParams({ template: "bug_report.yml", browser: describeBrowser(context.userAgent), version: versionOf(context) });
  return `${NEW_ISSUE}?${params}`;
}

/** A `mailto:` link for the same report, for anyone without a GitHub account. */
export function bugReportEmail(context: Context): string {
  const body = `What happened:\n\n\nWhat you expected:\n\n\nHow to make it happen again:\n\n\n--\nBrowser: ${describeBrowser(context.userAgent)}\nVersion: ${versionOf(context)}\n`;
  return `mailto:${SUPPORT_EMAIL}?${new URLSearchParams({ subject: "Plotra bug report", body }).toString().replace(/\+/g, "%20")}`;
}
