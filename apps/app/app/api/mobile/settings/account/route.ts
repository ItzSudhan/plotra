import { emailPreferences, type EmailPreference } from "@plotra/db/schema";
import { getAccount, updateName } from "@/lib/account-actions";
import { ApiError, body, json, withApi } from "@/lib/api/handler";
import { getUserPrefs, updateUserPrefs } from "@/lib/notify-actions";

// Your own settings, for the phone app: name, photo and notification emails,
// through the web's actions (lib/account-actions.ts, lib/notify-actions.ts).
// Email, password, Google and API tokens stay on the web.
//
// GET   → { name, email, image, photoUploads, ownPhoto, emailNotifications }
// PATCH { name?, emailNotifications? }

async function view() {
  const [account, prefs] = await Promise.all([getAccount(), getUserPrefs()]);
  return { name: account.name, email: account.email, image: account.image, photoUploads: account.photoUploads, ownPhoto: account.ownPhoto, emailNotifications: prefs.emailNotifications };
}

export function GET(request: Request) {
  return withApi(request, "read", async () => json(await view()));
}

export function PATCH(request: Request) {
  return withApi(request, "write", async () => {
    const input = await body<{ name?: unknown; emailNotifications?: unknown }>(request);
    if (input.name !== undefined) {
      if (typeof input.name !== "string") throw new ApiError(400, "A name is text.");
      await updateName(input.name);
    }
    if (input.emailNotifications !== undefined) {
      if (!(emailPreferences as readonly unknown[]).includes(input.emailNotifications)) throw new ApiError(400, "Choose off, each one or a daily digest.");
      await updateUserPrefs({ emailNotifications: input.emailNotifications as EmailPreference });
    }
    return json(await view());
  });
}
