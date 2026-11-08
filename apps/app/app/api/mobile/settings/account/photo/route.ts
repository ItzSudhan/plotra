import { removeProfilePhoto, uploadProfilePhoto } from "@/lib/account-actions";
import { ApiError, body, json, withApi } from "@/lib/api/handler";
import { MAX_PHOTO_BYTES } from "@/lib/profile-photo";

// Your profile photo from the phone app. The phone crops it to a small square
// first, as the browser does (src/components/photo-crop.tsx), and sends it as
// base64; uploadProfilePhoto checks what the bytes are and how big.
//
// POST   { photo: <base64> } → { image }
// DELETE                      → { ok }

export function POST(request: Request) {
  return withApi(request, "write", async () => {
    const { photo } = await body<{ photo?: unknown }>(request);
    if (typeof photo !== "string" || !photo) throw new ApiError(400, "Send photo, as base64.");
    if (photo.length > (MAX_PHOTO_BYTES * 4) / 3 + 4) throw new ApiError(413, "That picture is too large. Try a smaller one.");
    const form = new FormData();
    form.set("photo", new Blob([Buffer.from(photo, "base64")]));
    return json(await uploadProfilePhoto(form));
  });
}

export function DELETE(request: Request) {
  return withApi(request, "write", async () => {
    await removeProfilePhoto();
    return json({ ok: true });
  });
}
