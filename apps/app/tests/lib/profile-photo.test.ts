import { describe, expect, test } from "bun:test";
import { centreSquare, ownPhotoKey, photoFileName, photoKey, photoType, photoUrl, sniffPhoto } from "@/lib/profile-photo";

// Profile photos (lib/profile-photo.ts): the crop, what the bytes say, and where a photo is kept.

describe("profile photos", () => {
  test("the crop is the middle square", () => {
    expect(centreSquare(400, 300)).toEqual({ x: 50, y: 0, size: 300 });
    expect(centreSquare(300, 500)).toEqual({ x: 0, y: 100, size: 300 });
    expect(centreSquare(256, 256)).toEqual({ x: 0, y: 0, size: 256 });
  });

  test("the type comes from the bytes", () => {
    expect(sniffPhoto(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffPhoto(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffPhoto(new TextEncoder().encode("GIF89a"))).toBe("image/gif");
    expect(sniffPhoto(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffPhoto(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffPhoto(new Uint8Array())).toBeNull();
  });

  test("keys only for names this app makes", () => {
    const name = photoFileName("image/webp", "0b1c2d3e-0000-4000-8000-123456789abc");
    expect(name).toBe("0b1c2d3e-0000-4000-8000-123456789abc.webp");
    expect(photoKey("ana", name)).toBe(`avatars/ana/${name}`);
    expect(photoKey("../ana", name)).toBeNull();
    expect(photoKey("ana", "../../secrets.webp")).toBeNull();
    expect(photoKey("ana", "x.svg")).toBeNull();
    expect(photoType(name)).toBe("image/webp");
    expect(photoType("0b1c2d3e-0000-4000-8000-123456789abc.jpg")).toBe("image/jpeg");
  });

  test("an uploaded photo is told apart from Google's", () => {
    const name = photoFileName("image/png");
    expect(ownPhotoKey("ana", photoUrl("ana", name))).toBe(`avatars/ana/${name}`);
    expect(ownPhotoKey("ana", photoUrl("ben", name))).toBeNull();
    expect(ownPhotoKey("ana", "https://lh3.googleusercontent.com/a/photo")).toBeNull();
    expect(ownPhotoKey("ana", null)).toBeNull();
  });
});
