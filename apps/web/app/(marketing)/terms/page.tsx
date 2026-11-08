import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/marketing/doc-page";
import { contactEmail, licenseUrl, openIssueUrl, repoUrl, securityUrl } from "@/lib/links";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using the hosted version of Plotra, on the Free plan or on Pro, in plain language.",
};

// Written to say plainly what Plotra does and doesn't promise. The numbers here
// (prices, the refund window, notice periods) are repeated on the Pricing,
// Refunds and Privacy pages: change them together, and change the date.

const Contact = () => <a href={`mailto:${contactEmail}`}>{contactEmail}</a>;

export default function TermsPage() {
  return (
    <DocPage
      eyebrow="Legal"
      title="Terms"
      intro="These are the terms for using Plotra, on the Free plan and on Pro, in plain language."
      updated="4 October 2026"
    >
      <h2 id="short">The short version</h2>
      <ul>
        <li>
          <strong>You own your work.</strong> We claim no rights to it.
        </li>
        <li>
          <strong>We never train AI on it.</strong>
        </li>
        <li>
          <strong>It comes with no warranty.</strong> One person runs it, and it is early software. Keep your own
          copy of anything you can&apos;t afford to lose.
        </li>
        <li>
          <strong>There is a Free plan and a paid plan, Pro.</strong> No feature is locked behind Pro. It renews until
          you cancel, and going back to Free deletes nothing.
        </li>
        <li>
          <strong>You can leave with everything.</strong> Export is never blocked, and you can have your data deleted.
        </li>
        <li>
          <strong>Don&apos;t use it to harm people or to break the service for others.</strong>
        </li>
      </ul>

      <h2 id="who">Who you are dealing with</h2>
      <p>
        The hosted version is run by Sudhan, an independent developer in India. There is no company. &quot;We&quot;
        on this page means Plotra and the person who runs it. Contact: <Contact />
      </p>

      <h2 id="account">Your account</h2>
      <ul>
        <li>You need an account to write. Give a real email address: it is how invitations and important notices reach you.</li>
        <li>Keep your password to yourself. What happens under your account is your responsibility.</li>
        <li>You must be at least 18 years old.</li>
        <li>One person, one account. Don&apos;t create accounts in bulk to get around the limits.</li>
      </ul>

      <h2 id="your-work">Your work</h2>
      <p>
        Everything you write, upload or build in Plotra stays yours. You give us only the permission needed to run the
        service for you: to store your work, sync it between you and the people you share it with, back it up, and show
        it to the people you chose. That permission ends when you delete the work, apart from backups that have not yet
        rotated out.
      </p>
      <p>We don&apos;t use your work to train AI, we don&apos;t sell it, and we don&apos;t read it except as the <Link href="/privacy#who-sees">privacy page</Link> describes.</p>
      <p>
        You are responsible for what you put in. Only upload or clip things you have the right to use. If you share a
        project, publish a wiki or turn on a read-only link, you decide who sees it.
      </p>

      <h2 id="ai">The AI agent</h2>
      <p>
        The agent is optional. On either plan it can run on your own API key or a local model. When you run it that
        way, the text it needs goes to the provider you chose, under your agreement with them, and you pay that
        provider; Plotra charges nothing for those runs.
      </p>
      <p>
        A workspace on Pro also has hosted AI: 1,500 credits each billing period, on a model Plotra provides, so nobody
        needs a key. One credit is 1,000 input tokens, and output tokens count five times. Credits reset when the
        period renews and don&apos;t roll over. On a hosted run, the text the agent needs goes to the model provider
        Plotra uses instead of one you chose.
      </p>
      <p>
        What the agent writes into your project is yours to keep, change or throw away, and yours to check: it can be
        wrong. More on the <Link href="/privacy#ai">privacy page</Link>.
      </p>

      <h2 id="plans">Plans and limits</h2>
      <p>
        Every workspace starts on the Free plan, which costs nothing and includes every feature. It has limits:
        projects, storage, members and guests per workspace, file size, and how fast you can send invitations. Pro
        raises those limits and adds hosted AI. The limits and the price of each plan are on the{" "}
        <Link href="/pricing">pricing page</Link>.
      </p>
      <p>
        Reaching a limit stops you adding more; it never deletes anything or blocks export. A workspace that goes from
        Pro back to Free keeps all its data, and can&apos;t add beyond the Free limits until it is under them.
      </p>
      <p>Sponsoring the project is a gift. It buys no extra features, no higher limits and no support agreement.</p>

      <h2 id="payments">Payments</h2>
      <ul>
        <li>
          <strong>Pro is a subscription for one workspace</strong>, not for one person: $10 a month, or $96 a year. Tax
          may be added where it applies.
        </li>
        <li>
          <strong>Creem is the seller.</strong> Payments are handled by Creem (creem.io) as merchant of record. Creem
          takes the payment, works out and collects sales tax or VAT, and sends the invoice. Plotra never sees or
          stores your card details.
        </li>
        <li>
          <strong>It renews until cancelled.</strong> The subscription renews at the end of each month or year until someone
          cancels it.
        </li>
        <li>
          <strong>You can cancel at any time</strong> from Workspace settings, under Plan &amp; billing. Cancelling
          stops the next renewal. The workspace keeps Pro until the end of the period already paid for, and then goes
          back to Free.
        </li>
        <li>When a subscription ends, for whatever reason, the workspace goes back to Free. Nothing is deleted.</li>
        <li>
          <strong>If a renewal payment fails</strong>, Creem tries the charge again over the following days and the
          workspace keeps Pro meanwhile. If the payment still can&apos;t be taken, the subscription ends and the
          workspace goes back to Free.
        </li>
        <li>
          <strong>Refunds.</strong> A first payment for Pro, monthly or yearly, is refunded in full if you ask within
          14 days. So is a yearly renewal, and any charge made by mistake. The whole policy is on the{" "}
          <Link href="/refunds">refunds page</Link>.
        </li>
        <li>If the price of Pro changes, people paying for it will be told by email before their next renewal.</li>
      </ul>

      <h2 id="rules">What you may not do</h2>
      <ul>
        <li>Break the law, or use Plotra to store or share material that is illegal where you or we are.</li>
        <li>Harass, threaten or defame people, or publish someone&apos;s private information.</li>
        <li>Upload malware, or use shared and public pages for spam or phishing.</li>
        <li>Use the hosted version as general file storage, or run automated load against it. Everyone on it shares the same servers.</li>
        <li>Try to get into other people&apos;s projects or accounts, or get around the limits. If you find a way, please report it through the <a href={securityUrl}>security policy</a> instead.</li>
      </ul>
      <p>
        Fiction is fiction. Dark themes, violence and villains in a story are not a breach of these rules. The rules are
        about real harm to real people.
      </p>

      <h2 id="ending">Ending</h2>
      <ul>
        <li>You can stop using Plotra at any time, export your work and have your account deleted. Cancel a Pro subscription first, so it doesn&apos;t renew.</li>
        <li>We can suspend or close an account that breaks the rules above. Unless it is urgent, for example to stop ongoing abuse, you will be told first and given the chance to export your work.</li>
        <li>The hosted version may change, and it may one day close. If it closes, people with an account will be told by email at least 30 days ahead, so they can export. The software stays open source, so you can keep running it yourself.</li>
      </ul>

      <h2 id="warranty">No warranty</h2>
      <p>
        The hosted version is provided as it is, by one person, on the Free plan and on Pro alike. It is early software. It may be
        unavailable, it may have bugs, and although every care is taken with your writing (version history, backups),
        we can&apos;t promise that nothing will ever be lost. Keep your own copy of work that matters to you.
      </p>
      <p>
        As far as the law allows, we make no warranties about the service and are not liable for loss of data, loss of
        income or any other loss that comes from using it or not being able to use it. Some places don&apos;t allow some
        of these limits; where that is so, they apply only as far as the law permits.
      </p>
      <p>
        The software has its own, separate disclaimer of warranty in <a href={licenseUrl}>its licence</a>.
      </p>

      <h2 id="law">Which law applies</h2>
      <p>
        These terms are governed by the laws of India. If you use Plotra as a consumer, the consumer protection law of
        the country you live in still protects you where it says it must. If something goes wrong, write to{" "}
        <Contact /> first: most things can be sorted out that way.
      </p>

      <h2 id="software">The software</h2>
      <p>
        Plotra&apos;s <a href={repoUrl}>source code</a> is licensed under the GNU Affero General Public License, version
        3 or later. You may use, study, change and share it under that licence. If you run a changed version as a
        service for other people, the licence requires you to offer them its source. These terms don&apos;t add to or take
        away from the licence.
      </p>
      <p>
        The icons are from the <a href="https://www.figma.com/community/file/1166831539721848736">Solar icon set</a>{" "}
        by 480 Design, used under the <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> licence.
        The other work Plotra is built on is <a href={`${repoUrl}/blob/master/CREDITS.md`}>credited in the repository</a>.
      </p>

      <h2 id="changes">Changes to these terms</h2>
      <p>
        This page lives in the public repository, so every change to it is on record. If something important changes,
        people with an account will be told by email before it takes effect. If you keep using the hosted version
        after that, the new terms apply.
      </p>

      <h2 id="contact">Questions</h2>
      <p>
        Write to <Contact />, or <a href={openIssueUrl}>open an issue</a> for anything that isn&apos;t private.
      </p>
    </DocPage>
  );
}
