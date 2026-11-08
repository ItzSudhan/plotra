// Profile photos (Your settings → Profile and account). The browser crops the
// picked picture to a small square (components/settings/account-section.tsx);
// the server checks what it got, keeps it in object storage and serves it at
// /api/avatar/<user>/<file>. Pure, so the tests can check it.

/** Pictures people may pick. */
export const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
/** The largest picture picked, before cropping. */
export const MAX_PICKED_BYTES = 2 * 1024 * 1024;
/** The largest cropped photo the server takes: a 256px square is far smaller. */
export const MAX_PHOTO_BYTES = 512 * 1024;
/** The cropped photo's width and height. */
export const PHOTO_SIZE = 256;

const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" } as const;
type PhotoType = keyof typeof extensions;

/** The square in the middle of a picture: where to start and how big it is. */
export function centreSquare(width: number, height: number): { x: number; y: number; size: number } {
  const size = Math.min(width, height);
  return { x: Math.round((width - size) / 2), y: Math.round((height - size) / 2), size };
}

/** What a picture's bytes say it is, whatever its name or stated type; null when it's none of the four. */
export function sniffPhoto(bytes: Uint8Array): PhotoType | null {
  const at = (offset: number, ...values: number[]) => values.every((value, i) => bytes[offset + i] === value);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** The file name a photo is kept under: a fresh id and its type's extension. */
export const photoFileName = (type: PhotoType, id: string = crypto.randomUUID()) => `${id}.${extensions[type]}`;

const fileName = /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/;
const userId = /^[A-Za-z0-9_-]{1,64}$/;

/** The address a photo is served at. */
export const photoUrl = (user: string, file: string) => `/api/avatar/${user}/${file}`;

/** Where in object storage a photo lives, or null when the user or file name isn't one this app makes. */
export function photoKey(user: string, file: string): string | null {
  return userId.test(user) && fileName.test(file) ? `avatars/${user}/${file}` : null;
}

/** The type to serve a photo as, from its file name. */
export function photoType(file: string): PhotoType {
  const ext = file.slice(file.lastIndexOf(".") + 1);
  return (Object.entries(extensions).find(([, e]) => e === ext)?.[0] as PhotoType | undefined) ?? "image/png";
}

/** The storage key behind a user's own uploaded photo, or null when their image is somewhere else (Google's) or none. */
export function ownPhotoKey(user: string, image: string | null | undefined): string | null {
  const prefix = `/api/avatar/${user}/`;
  if (!image?.startsWith(prefix)) return null;
  return photoKey(user, image.slice(prefix.length));
}
