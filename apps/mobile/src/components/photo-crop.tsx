"use dom";

import type { DOMProps } from "expo/dom";
import { useEffect } from "react";

// Makes a profile photo small before it's sent, as the web does in the browser
// (apps/app/components/settings/account-section.tsx): the square in the middle
// of the picture, 256 pixels across. React Native can't redraw a picture
// itself, so this runs in a hidden web view (an Expo DOM component), on a
// canvas. The server takes up to 512 KB (apps/app/lib/profile-photo.ts).

const PHOTO_SIZE = 256;

export default function PhotoCrop({ source, onDone }: { source: string; onDone: (result: { base64: string } | { error: string }) => Promise<void>; dom?: DOMProps }) {
  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      const x = Math.round((image.naturalWidth - size) / 2);
      const y = Math.round((image.naturalHeight - size) / 2);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = PHOTO_SIZE;
      const context = canvas.getContext("2d");
      if (!context) return void onDone({ error: "That picture couldn't be opened. Try another." });
      context.imageSmoothingQuality = "high";
      context.drawImage(image, x, y, size, size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
      // JPEG: every phone's web view can write it, and the server accepts it.
      void onDone({ base64: canvas.toDataURL("image/jpeg", 0.9).split(",")[1] ?? "" });
    };
    image.onerror = () => void onDone({ error: "That picture couldn't be opened. Try another." });
    image.src = source;
  }, [source, onDone]);
  return null;
}
