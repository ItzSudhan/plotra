import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/marketing/doc-page";
import { contactEmail } from "@/lib/links";

export const metadata: Metadata = {
  title: "Refunds",
  description:
    "When a payment for Plotra Pro is refunded, how to ask, and how cancelling works. A first payment is refunded in full within 14 days.",
};

// The refund window here is repeated in Terms ("Payments") and in the Pricing
// page's questions. Change them together.

const Contact = () => <a href={`mailto:${contactEmail}`}>{contactEmail}</a>;

export default function RefundsPage() {
  return (
    <DocPage
      eyebrow="Legal"
      title="Refunds"
      intro="Pro is a subscription for one workspace: $10 a month, or $96 a year. This page says when a payment is refunded and how to ask."
      updated="4 October 2026"
    >
      <h2 id="short">The short version</h2>
      <ul>
        <li>
          <strong>Your first payment is refunded in full</strong> if you ask within 14 days of it, on the monthly or the
          yearly plan. You don&apos;t have to give a reason.
        </li>
        <li>
          <strong>A yearly renewal is refunded in full</strong> if you ask within 14 days of the renewal.
        </li>
        <li>
          <strong>A charge made by mistake is always refunded</strong>: being charged twice, or charged after you
          cancelled.
        </li>
        <li>
          <strong>You can cancel at any time.</strong> Nothing you wrote is deleted, on a refund or a cancellation.
        </li>
      </ul>

      <h2 id="when">When a payment is refunded</h2>
      <ul>
        <li>
          <strong>The first payment for a workspace&apos;s Pro subscription:</strong> in full, within 14 days of the
          charge. This is once per workspace: a workspace that subscribes again later has already had its first
          payment.
        </li>
        <li>
          <strong>A yearly renewal:</strong> in full, within 14 days of the charge. You are sent an invoice by email
          when it renews, so there is time to notice.
        </li>
        <li>
          <strong>A monthly renewal:</strong> not refunded. Cancel, and the workspace keeps Pro until the end of the
          month already paid for.
        </li>
        <li>
          <strong>A mistake on our side or the payment provider&apos;s:</strong> always, whenever it is found.
        </li>
        <li>
          <strong>Time left on a plan you cancel part-way through:</strong> not refunded, outside the 14 days above.
          The workspace keeps Pro to the end of the period instead.
        </li>
      </ul>
      <p>
        If the hosted version is down for a long stretch, or something in Pro you paid for doesn&apos;t work and
        can&apos;t be fixed, write in. That is settled case by case, and the answer leans towards giving the money
        back.
      </p>
      <p>Where the law of the country you live in gives you a longer period or more rights, those apply as well.</p>

      <h2 id="how">How to ask</h2>
      <ol>
        <li>
          Write to <Contact /> from the email address on your account.
        </li>
        <li>Give the name of the workspace, and the date of the charge if you have it.</li>
      </ol>
      <p>
        You get a reply within 3 working days. Payments are handled by Creem, the merchant of record, so the refund
        is made through Creem to the card or method you paid with. It usually shows up within 5 to 10 working days,
        depending on your bank.
      </p>
      <p>
        When a payment is refunded, the subscription it paid for ends and the workspace goes back to the Free plan.
        Everything in it stays. If it holds more than the Free limits allow, nothing is removed: you can&apos;t add
        more until it is under them, and export always works.
      </p>

      <h2 id="cancel">Cancelling</h2>
      <p>
        Cancel at any time from Workspace settings, under Plan &amp; billing. Cancelling stops the next renewal. The
        workspace keeps Pro until the end of the period already paid for, and then goes back to Free. Cancelling is
        not the same as asking for a refund: to get money back for a charge, write in as above.
      </p>

      <h2 id="not-covered">What this doesn&apos;t cover</h2>
      <ul>
        <li>
          <strong>The Free plan</strong> costs nothing, so there is nothing to refund.
        </li>
        <li>
          <strong>AI on your own key.</strong> Runs on your own API key are billed by the provider you chose, not by
          Plotra.
        </li>
        <li>
          <strong>Sponsorship</strong> of the project on GitHub is a gift, handled by GitHub.
        </li>
        <li>
          <strong>Enterprise plans</strong> follow the terms agreed with the team.
        </li>
      </ul>

      <h2 id="more">More</h2>
      <p>
        The rest of the terms for paying are in the <Link href="/terms#payments">Terms</Link>, and what Plotra and
        Creem each store about a payment is on the <Link href="/privacy">Privacy page</Link>. Questions: <Contact />.
      </p>
    </DocPage>
  );
}
