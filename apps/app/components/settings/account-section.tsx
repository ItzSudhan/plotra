"use client";

import { authClient, signOut } from "@plotra/auth/client";
import { Icon } from "@plotra/icons";
import { Badge } from "@plotra/ui/components/badge";
import { Button } from "@plotra/ui/components/button";
import { confirm } from "@plotra/ui/components/dialogs";
import { Field } from "@plotra/ui/components/field";
import { Input } from "@plotra/ui/components/input";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { forgetKeptProjects } from "@/components/offline/keep-offline";
import { forgetPageCopies } from "@/components/offline/service-worker";
import { deleteAccount, removeProfilePhoto, updateName, uploadProfilePhoto, type AccountView } from "@/lib/account-actions";
import { authErrorText } from "@/lib/auth-errors";
import { isLocalMode } from "@/lib/local-mode";
import { forget } from "@/lib/posthog";
import { centreSquare, MAX_PICKED_BYTES, PHOTO_SIZE, PHOTO_TYPES } from "@/lib/profile-photo";
import { PersonAvatar, Section } from "./ui";
import { useRun } from "./use-run";

// Your settings → Profile and account. The name is saved through the server
// (lib/account-actions.ts); email, password and Google go from here to Better
// Auth, which emails a link wherever a change needs confirming.

const card = "grid gap-4 rounded-lg border bg-card p-4";
const row = "flex flex-wrap items-center justify-between gap-3";

/** Runs a Better Auth client call, toasting its error in plain words. Resolves true when it worked. */
async function call(fn: () => Promise<{ error: { code?: string; message?: string; status?: number } | null }>, success?: string): Promise<boolean> {
  try {
    const { error } = await fn();
    if (error) {
      toast.error(authErrorText(error));
      return false;
    }
  } catch (error) {
    toast.error(authErrorText(error as Error));
    return false;
  }
  if (success) toast.success(success);
  return true;
}

export function AccountSection({ account }: { account: AccountView }) {
  return (
    <Section title="Profile and account" description="Who you are in Plotra, and how you sign in.">
      <ProfileCard account={account} />
      {!isLocalMode && <SignInCard account={account} />}
      {!isLocalMode && <DeleteAccountCard account={account} />}
    </Section>
  );
}

function ProfileCard({ account }: { account: AccountView }) {
  const { run, pending } = useRun();
  const [name, setName] = useState(account.name);
  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [sending, setSending] = useState(false);

  return (
    <div className={card}>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          await run(() => updateName(name), "Name saved.");
        }}
      >
        <PersonAvatar name={account.name} image={account.image} className="size-10" />
        <Field label="Your name" hint="Your byline on comments, history and the people list." className="min-w-56 flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="name" className="h-8 text-ui-sm" />
        </Field>
        <Button type="submit" size="sm" disabled={pending || !name.trim() || name.trim() === account.name}>
          Save
        </Button>
      </form>
      <PhotoRow account={account} />

      {!isLocalMode && (
        <div className="grid gap-3 border-t pt-4">
          <div className={row}>
            <div className="min-w-0">
              <p className="text-ui-sm font-medium">Email</p>
              <p className="text-ui-sm break-all text-muted-foreground">{account.email}</p>
            </div>
            {!changingEmail && (
              <Button type="button" size="sm" variant="outline" onClick={() => setChangingEmail(true)}>
                Change email
              </Button>
            )}
          </div>
          {changingEmail && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                setSending(true);
                const ok = await call(() => authClient.changeEmail({ newEmail: newEmail.trim(), callbackURL: "/settings" }));
                setSending(false);
                if (!ok) return;
                toast.success(`Check your inbox: we've sent a link to confirm the change. Until then you keep signing in with ${account.email}.`);
                setChangingEmail(false);
                setNewEmail("");
              }}
            >
              <Field label="New email" className="min-w-56 flex-1">
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required autoFocus autoComplete="email" className="h-8 text-ui-sm" />
              </Field>
              <Button type="submit" size="sm" disabled={sending || !newEmail.trim()}>
                {sending ? "Sending…" : "Send confirmation"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setChangingEmail(false)}>
                Cancel
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/** The middle square of a picture, drawn at PHOTO_SIZE: WebP where the browser can make it, PNG otherwise. */
async function cropPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That picture couldn't be opened. Try another.");
  });
  const { x, y, size } = centreSquare(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PHOTO_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("That picture couldn't be opened. Try another.");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, x, y, size, size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob) throw new Error("That picture couldn't be opened. Try another.");
  return blob;
}

/** Upload, change or remove your photo. Uploading needs object storage; without it, only a Google photo can be removed. */
function PhotoRow({ account }: { account: AccountView }) {
  const { run, pending } = useRun();
  const input = useRef<HTMLInputElement>(null);
  if (!account.photoUploads && !account.image) return null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Choose a PNG, JPEG, WebP or GIF picture.");
      return;
    }
    if (file.size > MAX_PICKED_BYTES) {
      toast.error("That picture is over 2 MB. Try a smaller one.");
      return;
    }
    await run(async () => {
      const form = new FormData();
      form.set("photo", await cropPhoto(file), "photo");
      await uploadProfilePhoto(form);
    }, "Photo saved.");
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Remove your photo?",
      description: account.ownPhoto ? "Your initials show instead. You can upload a photo again at any time." : "Your initials show instead of your Google photo.",
      confirmLabel: "Remove photo",
    });
    if (ok) await run(() => removeProfilePhoto(), "Photo removed.");
  };

  return (
    <div className={row}>
      <div className="min-w-0">
        <p className="text-ui-sm font-medium">Photo</p>
        <p className="text-meta text-muted-foreground">
          {account.image && !account.ownPhoto ? "Your photo comes from your Google account." : "A square picture works best. PNG, JPEG, WebP or GIF, up to 2 MB."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {account.photoUploads && (
          <>
            <input
              ref={input}
              type="file"
              accept={PHOTO_TYPES.join(",")}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                void pick(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => input.current?.click()}>
              <Icon name="camera-linear" />
              {account.image ? "Change photo" : "Upload photo"}
            </Button>
          </>
        )}
        {account.image && (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void remove()}>
            Remove photo
          </Button>
        )}
      </div>
    </div>
  );
}

function SignInCard({ account }: { account: AccountView }) {
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);

  const sendSetPasswordLink = async () => {
    setBusy(true);
    const ok = await call(() => authClient.requestPasswordReset({ email: account.email, redirectTo: "/reset-password" }));
    setBusy(false);
    if (ok) toast.success(`We've sent a link to ${account.email}. It works for an hour.`);
  };

  return (
    <div className={card}>
      <div className={row}>
        <div className="flex min-w-0 items-start gap-3">
          <Icon name="lock-password-linear" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-ui-sm font-medium">Password</p>
            <p className="text-ui-sm text-muted-foreground">
              {account.hasPassword ? "You can sign in with your email and password." : "You don't have a password yet. Set one to sign in without Google."}
            </p>
          </div>
        </div>
        {account.hasPassword ? (
          !changing && (
            <Button type="button" size="sm" variant="outline" onClick={() => setChanging(true)}>
              Change password
            </Button>
          )
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void sendSetPasswordLink()}>
            {busy ? "Sending…" : "Email me a link to set one"}
          </Button>
        )}
      </div>
      {changing && (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setBusy(true);
            const ok = await call(
              () => authClient.changePassword({ currentPassword: String(data.get("current")), newPassword: String(data.get("next")), revokeOtherSessions: true }),
              "Password changed. You're signed out on your other devices.",
            );
            setBusy(false);
            if (ok) setChanging(false);
          }}
        >
          <Field label="Current password">
            <Input name="current" type="password" required autoComplete="current-password" autoFocus className="h-8 text-ui-sm" />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <Input name="next" type="password" required minLength={8} autoComplete="new-password" className="h-8 text-ui-sm" />
          </Field>
          <div className="flex gap-2 sm:mb-5">
            <Button type="submit" size="sm" disabled={busy}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setChanging(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {(account.googleAvailable || account.google) && (
        <div className={`${row} border-t pt-4`}>
          <div className="flex min-w-0 items-start gap-3">
            <Icon name="link-linear" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="flex items-center gap-2 text-ui-sm font-medium">
                Google
                {account.google && <Badge tone="teal">Connected</Badge>}
              </p>
              <p className="text-ui-sm text-muted-foreground">
                {account.google ? "You can sign in with Google." : "Connect it to sign in with one click."}
                {account.google && !account.hasPassword && " It's your only way in, so set a password before disconnecting it."}
              </p>
            </div>
          </div>
          {account.google ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !account.hasPassword}
              onClick={async () => {
                const ok = await confirm({
                  title: "Disconnect Google?",
                  description: "You'll sign in with your email and password instead. You can connect it again whenever you like.",
                  confirmLabel: "Disconnect",
                });
                if (!ok) return;
                setBusy(true);
                if (await call(() => authClient.unlinkAccount({ accountId: account.google! }), "Google disconnected.")) router.refresh();
                setBusy(false);
              }}
            >
              Disconnect
            </Button>
          ) : (
            account.googleAvailable && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  if (!(await call(() => authClient.linkSocial({ provider: "google", callbackURL: "/settings" })))) setBusy(false);
                }}
              >
                Connect Google
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function DeleteAccountCard({ account }: { account: AccountView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    const ok = await confirm({
      title: "Delete your account?",
      description:
        "Your account goes for good, with every workspace you're alone in and all of its projects. Workspaces you share stay with the people in them. This can't be undone.",
      confirmLabel: "Delete my account",
      typeToConfirm: account.email,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteAccount(account.hasPassword ? password : null);
    } catch (error) {
      toast.error(authErrorText(error as Error));
      setBusy(false);
      return;
    }
    await signOut().catch(() => {});
    forget();
    await forgetPageCopies();
    forgetKeptProjects();
    router.push("/sign-up");
    router.refresh();
  };

  return (
    <div className="grid gap-3 rounded-lg border border-destructive/30 bg-card p-4">
      <div className={row}>
        <div>
          <p className="text-ui-sm font-medium">Delete your account</p>
          <p className="text-ui-sm text-muted-foreground">
            Workspaces you share with others need another owner first. Workspaces you&apos;re alone in are deleted with it.
          </p>
        </div>
        {!open && (
          <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
            Delete account…
          </Button>
        )}
      </div>
      {open && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void remove();
          }}
        >
          {account.hasPassword && (
            <Field label="Your password" hint="To make sure it's you." className="min-w-56 flex-1">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" autoFocus className="h-8 text-ui-sm" />
            </Field>
          )}
          <Button type="submit" size="sm" variant="destructive" disabled={busy || (account.hasPassword && !password)}>
            {busy ? "Deleting…" : "Delete account"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </form>
      )}
    </div>
  );
}
