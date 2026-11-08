import { LinkGone } from "@/components/public/link-gone";

// A read-only link that's switched off or never existed (app/p/[token]/layout.tsx calls notFound()).
export default function ReaderNotFound() {
  return (
    <>
      <title>Link not working · Plotra</title>
      {/* The token in the address is a secret, even a dead one. */}
      <meta name="referrer" content="no-referrer" />
      <LinkGone />
    </>
  );
}
