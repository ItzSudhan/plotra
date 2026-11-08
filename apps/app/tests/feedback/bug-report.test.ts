import { describe, expect, test } from "bun:test";
import { bugReportEmail, bugReportUrl, describeBrowser } from "@/lib/bug-report";

// "Report a bug" in the account menu opens GitHub's bug form with the browser and version filled in.

const UA = {
  chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edgeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0",
  safariIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

describe("describeBrowser", () => {
  test("names the browser and the system", () => {
    expect(describeBrowser(UA.chromeMac)).toBe("Chrome 141 on macOS");
    expect(describeBrowser(UA.edgeWin)).toBe("Edge 141 on Windows");
    expect(describeBrowser(UA.firefoxLinux)).toBe("Firefox 143 on Linux");
    expect(describeBrowser(UA.safariIos)).toBe("Safari 18 on iOS");
  });

  test("falls back to the user agent itself", () => {
    expect(describeBrowser("SomeBot/1.0")).toBe("SomeBot/1.0");
  });
});

describe("bugReportUrl", () => {
  const today = new Date("2026-10-19T12:00:00Z");

  test("fills in the template's browser and version fields", () => {
    const url = new URL(bugReportUrl({ userAgent: UA.firefoxLinux, commit: "445da06", today }));
    expect(url.origin + url.pathname).toBe("https://github.com/ItzSudhan/plotra/issues/new");
    expect(url.searchParams.get("template")).toBe("bug_report.yml");
    expect(url.searchParams.get("browser")).toBe("Firefox 143 on Linux");
    expect(url.searchParams.get("version")).toBe("445da06 (2026-10-19)");
  });

  test("gives the date alone without a commit", () => {
    const url = new URL(bugReportUrl({ userAgent: UA.chromeMac, today }));
    expect(url.searchParams.get("version")).toBe("2026-10-19");
  });
});

describe("bugReportEmail", () => {
  test("addresses an email with the browser and version in its body", () => {
    const link = bugReportEmail({ userAgent: UA.chromeMac, commit: "445da06", today: new Date("2026-10-19T12:00:00Z") });
    expect(link.startsWith("mailto:sudhan@plotra.ink?")).toBe(true);
    const params = new URLSearchParams(link.split("?")[1]);
    expect(params.get("subject")).toBe("Plotra bug report");
    expect(params.get("body")).toContain("Browser: Chrome 141 on macOS");
    expect(params.get("body")).toContain("Version: 445da06 (2026-10-19)");
    // Spaces as %20: mail apps show a "+" literally.
    expect(link).not.toContain("+");
  });
});
