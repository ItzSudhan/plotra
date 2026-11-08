import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, DocTable } from "@/components/marketing/doc-page";
import { appUrl, docsUrl, repoUrl } from "@/lib/links";

export const metadata: Metadata = {
  title: "Download",
  description:
    "Plotra for macOS, Windows and Linux. Use your Plotra Cloud account in it, or keep everything in a folder on your own computer, with no account and no internet.",
};

// The file names are set in apps/desktop/electron-builder.yml (`artifactName`).
// Keep the two in step. local-mode-plan.md has the whole design.

const latest = `${repoUrl}/releases/latest/download`;
const releases = `${repoUrl}/releases`;

const downloads: React.ReactNode[][] = [
  [
    "macOS",
    <>
      <a href={`${latest}/Plotra-mac-arm64.dmg`}>Apple silicon</a> · <a href={`${latest}/Plotra-mac-x64.dmg`}>Intel</a>
    </>,
    "macOS 12 or later",
  ],
  [
    "Windows",
    <>
      <a href={`${latest}/Plotra-windows-x64-setup.exe`}>64-bit</a> · <a href={`${latest}/Plotra-windows-arm64-setup.exe`}>Arm</a>
    </>,
    "Windows 10 or later",
  ],
  [
    "Linux",
    <>
      <a href={`${latest}/Plotra-linux-x86_64.AppImage`}>AppImage</a> · <a href={`${latest}/Plotra-linux-amd64.deb`}>.deb</a>
    </>,
    "64-bit",
  ],
];

const compare: React.ReactNode[][] = [
  ["Account", "Your Plotra account", "None"],
  ["Where your work is", "Plotra's servers", "A folder you choose"],
  ["Internet", "Needed to sync", "Never needed"],
  ["Writing with others, sharing, public links", "Yes", "No"],
  ["Sync between your devices", "Yes", "Copy the folder yourself"],
  ["AI", "Hosted AI on Pro, or your own key", "Your own key, or a local model (Ollama)"],
  ["Backups", "Ours", "Yours: daily snapshots in the folder"],
  ["Plan limits", "Free or Pro", "None: as big as your disk"],
];

export default function DownloadPage() {
  return (
    <DocPage
      eyebrow="Download"
      title="Plotra on your computer"
      intro="One app, two ways to work: sign in to Plotra Cloud, or keep a library of your own in a folder on this computer, with no account and no internet."
      draft={
        <>
          The desktop app is new. Until its first release is published, these links lead nowhere: watch the{" "}
          <a href={releases}>releases page</a>. Early builds may not be signed, so macOS and Windows will ask before
          opening them the first time.
        </>
      }
    >
      <h2 id="get">Get it</h2>
      <DocTable head={["", "Download", "Runs on"]} rows={downloads} />
      <p>
        Every release, with its notes, is on <a href={releases}>GitHub</a>. The app updates itself when a new version is
        out. You can always use Plotra in the browser instead, at <a href={appUrl}>{appUrl.replace(/^https?:\/\//, "")}</a>.
      </p>

      <h2 id="two-ways">Cloud or this computer</h2>
      <p>
        The first time it opens, Plotra asks where your work should live. You can change it from the File menu, and
        have both: a cloud workspace for a book you write with someone, and a library on your computer for a private
        journal.
      </p>
      <DocTable head={["", "Plotra Cloud", "On this computer"]} rows={compare} />

      <h2 id="library">Your library</h2>
      <p>
        On this computer, everything lives in a folder you pick, called a library. Every view, module and tool works
        there as it does in the cloud: the editor, the story bible, continuity checks, timelines, maps, import and
        export, version history.
      </p>
      <ul>
        <li>
          <strong>A readable copy.</strong> Beside the database, Plotra keeps every project as Markdown files, updated as
          you write, so your work is readable without Plotra.
        </li>
        <li>
          <strong>Snapshots.</strong> A dated copy of the whole library is kept every day, and whenever you ask. Restore
          one from the File menu.
        </li>
        <li>
          <strong>One app at a time.</strong> If you sync the folder between computers, close Plotra on one before you
          open the library on the other. Plotra says so if you forget.
        </li>
        <li>
          <strong>Moving a project.</strong> Export it as a Plotra project file and import it on the other side, from the
          cloud to your library or back.
        </li>
      </ul>
      <p>
        Nothing in a library reaches us, so we can&apos;t recover it either: back the folder up. The{" "}
        <a href={docsUrl}>docs</a> have more, and the <Link href="/pricing">pricing page</Link> has what the cloud costs.
      </p>
    </DocPage>
  );
}
