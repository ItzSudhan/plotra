import type { Metadata } from "next";
import { DocPage, DocTable } from "@/components/marketing/doc-page";
import { contactEmail, docsUrl, openIssueUrl, repoUrl } from "@/lib/links";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What the hosted version of Plotra stores, where it is kept, who can see it, and how to export or delete it.",
};

// This page makes promises on the maintainer's behalf: answering requests within
// 30 days, telling people by email before the hosted version closes or this
// page changes in an important way, and telling someone if the law forces their
// data to be handed over. Keep it in step with what the app and the services
// behind it really do, and change the date when the text changes.

const Contact = () => <a href={`mailto:${contactEmail}`}>{contactEmail}</a>;

// Where data lives. One row per outside service the hosted version uses.
const providers: React.ReactNode[][] = [
  [
    "Neon",
    "The Postgres database",
    "Your account, your workspaces and projects, the text of your notes, comments, properties and sharing settings",
  ],
  [
    "Cloudflare",
    "The collaboration server (Workers and Durable Objects) and file storage (R2)",
    "A working copy of each document while and after it is edited; uploaded files; version snapshots; the nightly database backups",
  ],
  ["Vercel", "Runs the app, this site and the docs", "Requests pass through it. It keeps request logs (IP address, address requested, time) for a short period"],
  ["Mailtrap", "Sends email", "The recipient's email address and the email itself: an invitation or a share notice, with the sender's name and the workspace or project name"],
  ["Google", "Sign-in, only if you choose \"Continue with Google\"", "Google tells us your name, email address and profile picture. We don't get access to anything else in your Google account"],
  [
    "Sentry",
    "Error tracking",
    "A technical report when something crashes: the error, the page, the browser. It is not meant to contain your text",
  ],
  [
    "PostHog",
    "Usage counts and visit analytics, for this site, the docs and the app",
    "The names of events (see below) with your account's id; the pages visited and what was clicked, with the app's text masked; the browser, device and an approximate location worked out from the IP address. No content",
  ],
  [
    "Creem",
    "Payments for Pro, as merchant of record. Only if a workspace subscribes",
    "What you enter at checkout: your name, email address, billing address and card details. It also keeps your invoices. Plotra never receives the card details",
  ],
  [
    "The hosted AI model provider",
    "Runs the AI agent for Pro workspaces that use hosted AI. Hosted AI is not switched on yet; the provider is named in this row before it is",
    "The text the agent needs for a run: the notes it reads, the project's story brief and the request. Only when someone runs the agent on hosted AI",
  ],
];

export default function PrivacyPage() {
  return (
    <DocPage
      eyebrow="Legal"
      title="Privacy"
      intro="What Plotra stores, where it is kept, who can see it, and how to export or delete it."
      updated="20 October 2026"
    >
      <h2 id="short">The short version</h2>
      <ul>
        <li>
          <strong>You own your work.</strong> Using Plotra gives us no rights to what you write.
        </li>
        <li>
          <strong>We never train AI on your work.</strong> The project has no AI model of its own and doesn&apos;t give
          your text to anyone who does.
        </li>
        <li>
          <strong>The AI agent sends text only when someone runs it.</strong> On your own key it goes to the provider
          you chose. On Pro&apos;s hosted AI it goes to the model provider Plotra uses. The agent is off unless a
          workspace owner or admin turns it on.
        </li>
        <li>
          <strong>No ads, and your data is never sold.</strong> Not your writing, not your email address, not usage
          data. The only thing Plotra sells is the Pro plan.
        </li>
        <li>
          <strong>Payments go through Creem.</strong> Plotra never sees your card. It stores only ids and the state of
          the subscription.
        </li>
        <li>
          <strong>You can export your work and delete it.</strong> Reaching a limit never blocks export.
        </li>
      </ul>

      <h2 id="who">Who runs it</h2>
      <p>
        Plotra is built and run by Sudhan, an independent developer in India. There is no company behind it. &quot;We&quot;
        on this page means Plotra and the person who runs it. The code that runs the hosted version is the code in
        the <a href={repoUrl}>public repository</a>, so you can check what this page says against it.
      </p>
      <p>
        Contact, for anything about your data, including a complaint: <Contact />. You get an answer within 30
        days.
      </p>

      <h2 id="what">What is stored</h2>
      <h3>Your account</h3>
      <ul>
        <li>Your name and email address, and a profile picture if you sign in with Google.</li>
        <li>Your password, stored only as a hash. We can&apos;t read it.</li>
        <li>Your sessions: when you signed in, and the IP address and browser of each session, so a session can be told apart and ended.</li>
      </ul>
      <h3>Your work</h3>
      <ul>
        <li>Workspaces and projects, and everything in them: notes and their text, properties, tags, links, timelines, canvases, comments, suggestions and review notes.</li>
        <li>Version history: the snapshots you name, and the automatic ones (the latest 40 per note).</li>
        <li>Files you upload or clip into a project.</li>
      </ul>
      <h3>Who you work with</h3>
      <ul>
        <li>The members of your workspaces and their roles.</li>
        <li>The people each project is shared with. If you invite someone by email, their address is stored even before they have an account, so the invitation can find them.</li>
      </ul>
      <h3>Billing, if a workspace is on Pro</h3>
      <p>
        Payments are handled by Creem, the merchant of record. Creem processes and keeps the payment data: card
        details, billing address, invoices. Plotra stores only what it needs to know which plan a workspace is on: a
        Creem customer id, a subscription id, and the state of the subscription (its status, which product it is,
        whether it is monthly or yearly, and the dates of the current period). It also keeps the ids of the
        notifications Creem sent, so that none is applied twice. No card number, billing address or invoice is stored
        by Plotra.
      </p>
      <p>
        For hosted AI, each agent run records how many tokens and credits it used, so the workspace&apos;s monthly
        allowance can be counted. That record holds numbers, not text.
      </p>
      <h3>Usage events</h3>
      <p>
        To know whether anyone uses Plotra, the app records that certain things happened: someone signed up, created a
        project, shared a project, invited a member, imported or exported, turned on the AI agent. An event has a name,
        a time, and the ids of the account, workspace and project. It never contains titles or text.
      </p>
      <p>
        PostHog also counts visits to this site, the docs and the app: which pages were opened, what was clicked, and
        the browser and device. In the app the text of what you click is masked before it is sent, addresses are sent
        without the token in a reader, invitation or share link, and nothing you type is recorded.
      </p>
      <h3>Counters</h3>
      <p>Short-lived counters for rate limits: how many sign-in attempts, invitations or uploads came from an account or address in the last while.</p>
      <h3>In your browser</h3>
      <ul>
        <li>A sign-in cookie.</li>
        <li>A PostHog cookie holding a random id, shared by this site, the docs and the app, so that visits can be counted. There are no advertising cookies.</li>
        <li>A copy of the documents you opened, so editing keeps working if the connection drops. It stays in that browser until you clear the site&apos;s data. On a shared computer, clear it.</li>
        <li>Your pane layout, shortcuts and a few view settings.</li>
      </ul>
      <p>
        This site, the one you are reading, sets only the PostHog cookie. Everything on it, including its background
        videos and fonts, is served from the site itself, and its analytics go to PostHog through this site&apos;s own
        address.
      </p>

      <h2 id="where">Where it is kept</h2>
      <p>The hosted version runs on these services. Each one handles the data described and nothing more is sent to it.</p>
      <DocTable head={["Service", "What it does", "What it holds or sees"]} rows={providers} />
      <p>These companies store data in their own data centres, which may be outside your country.</p>

      <h2 id="ai">AI</h2>
      <p>Plotra works without AI, and the AI agent is off unless the workspace&apos;s owner turns it on, per workspace and per project.</p>
      <ul>
        <li>On either plan, the agent can run on <strong>your own API key</strong> for a provider you pick, or on a model running on your own computer.</li>
        <li>
          A workspace on Pro also has <strong>hosted AI</strong>, which runs on a key the project holds, so nobody needs their own. On a hosted run, the notes the agent reads are sent to <strong>the model provider Plotra uses</strong>, instead of a provider you chose. Hosted AI is not switched on yet. Before it is, this page will name the provider and say what its terms allow it to do with the text, and it will only be a provider whose terms rule out training on it. If you would rather your text went only to your own provider, add your own key: runs on your own key don&apos;t use hosted AI.
        </li>
        <li>
          Text leaves Plotra <strong>only when someone runs the agent</strong>, and it goes <strong>only to the provider for that run</strong>: the one that person chose, or Plotra&apos;s on a hosted run. What is sent is what the agent needs for the task: the notes it reads, the project&apos;s story brief, and your request.
        </li>
        <li>
          <strong>Collaborators count too.</strong> If someone who can edit your project runs the agent, the notes it reads go to their provider, under their key, or to Plotra&apos;s provider on a hosted run. If you don&apos;t want that, leave the agent switched off for the project.
        </li>
        <li>On your own key, what the provider does with the text is governed by your agreement with that provider. Read their terms, especially on training.</li>
        <li>Your key is stored encrypted, used only on the server for your own runs, never shown again in the browser and never shared with collaborators.</li>
        <li>
          With a model on your own computer, your browser calls it directly: what the model is sent and what it writes go between your browser and that model, not to any provider, and a key for it is kept in your browser and never sent to us. Our server still does what it does for every run: it builds the instructions, runs the agent&apos;s tools as you, and stores the conversation, the model&apos;s name and address, and the token counts.
        </li>
        <li>We never use your work to train a model. We don&apos;t have one: hosted AI runs on another company&apos;s model.</li>
      </ul>

      <h2 id="who-sees">Who can see your work</h2>
      <ul>
        <li>You.</li>
        <li>The members of the workspace a project is in, and the people you shared the project with, each within their role.</li>
        <li>Anyone with the link, if you turn on a project&apos;s read-only link or publish a wiki from it. Both are off until you turn them on, and can be turned off again.</li>
        <li>
          Wherever a project&apos;s managers send it. If they keep a project in a GitHub repository, its notes are
          written there as Markdown, under GitHub&apos;s terms and that repository&apos;s visibility. A webhook sends
          what happened (ids and titles, never the text) to the address they gave. A personal API token reads what its
          owner can read. All of these are off until someone sets them up.
        </li>
        <li>The maintainer. Your work is stored so that the server can sync it between collaborators, which means it is not end-to-end encrypted and the person running the service can technically read the database. The maintainer does not read your work, except when you ask for help with a problem and that requires looking, or when the law requires it.</li>
      </ul>
      <p>We don&apos;t sell your data, and we don&apos;t share it with anyone except the services listed above, each for the job described there. If the law forced us to hand something over, we would tell you unless the law forbade that too.</p>

      <h2 id="export-delete">Exporting and deleting</h2>
      <h3>Export</h3>
      <p>
        You can export your work at any time, and no limit ever blocks it. The formats and where to find them are in the{" "}
        <a href={`${docsUrl}/docs/get-started`}>guide</a>.
      </p>
      <h3>Delete</h3>
      <ul>
        <li>A note goes to the project&apos;s trash first. &quot;Delete forever&quot; and &quot;Empty trash&quot; remove it for good.</li>
        <li>Comments, files, shared people and workspace members can be removed where they are listed.</li>
        <li>
          To delete a whole project, a workspace or your account, write to <Contact /> from the email address on
          the account. The app has no button for these yet. The request is carried out within 30 days, and you are
          told when it is done.
        </li>
      </ul>
      <p>
        Deleted data is gone from the live database at once. The database is backed up every night and the latest
        14 backups are kept, so a copy can remain in a backup for up to 14 days. The copy in your own browser stays until you clear the site&apos;s data.
      </p>
      <h3>Your other rights</h3>
      <p>
        You can ask what is stored about you, ask for a copy of it, have something wrong corrected, or withdraw a
        consent you gave, for example by turning the AI agent off again. Write to <Contact />. These rights are yours
        wherever you live; the law where you live, such as India&apos;s Digital Personal Data Protection Act or the
        GDPR, may give you more, including the right to complain to its data protection authority.
      </p>
      <h3>If the hosted version ever closes</h3>
      <p>You would be told by email, with time to export, and the software stays available to run yourself.</p>

      <h2 id="how-long">How long things are kept</h2>
      <ul>
        <li>Your account and your work: until you delete them.</li>
        <li>Automatic versions: the latest 40 per note. Older ones are removed as new ones are made.</li>
        <li>Usage events: kept as counts. They hold no content.</li>
        <li>Billing ids and subscription state: while the workspace exists. Creem keeps payment and invoice records for as long as tax law requires of it.</li>
        <li>Request logs at the hosting providers: for the short periods those providers keep them.</li>
      </ul>

      <h2 id="security">Security</h2>
      <p>
        Connections are encrypted in transit. Access to every project is checked on the server and again by the
        database. That is care, not a guarantee: Plotra is early software run by one person. Keep
        your own copy of work you can&apos;t afford to lose. If you find a security problem, please report it privately
        as described in the <a href={`${repoUrl}/blob/master/SECURITY.md`}>security policy</a>.
      </p>

      <h2 id="children">Children</h2>
      <p>
        The hosted version is for people aged 18 or over. It doesn&apos;t knowingly keep an account for anyone younger.
        If you believe a child has signed up, write to <Contact /> and the account will be removed.
      </p>

      <h2 id="changes">Changes to this page</h2>
      <p>
        This page lives in the public repository, so <a href={`${repoUrl}/commits/master/apps/web/app/(marketing)/privacy/page.tsx`}>every change to it is on record</a>. If something important changes, people with an account will be told by email before it takes effect.
      </p>

      <h2 id="contact">Questions</h2>
      <p>
        Write to <Contact />. For anything that isn&apos;t private, you can also{" "}
        <a href={openIssueUrl}>open an issue</a>.
      </p>
    </DocPage>
  );
}
