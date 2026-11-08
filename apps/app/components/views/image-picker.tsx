"use client";

import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import { Field } from "@plotra/ui/components/field";
import { Input } from "@plotra/ui/components/input";
import { useRef, useState } from "react";
import { fileUrl, isImage, uploadAttachment } from "@/components/research/attachments";
import { errorText } from "@/lib/errors";
import { checkImageLink } from "@/lib/image-link";

// Puts a picture somewhere (the editor, a storyboard panel): uploaded from the
// computer the same way research attachments and maps are, or from a link.

export type PickedImage = { url: string; alt: string };

/** A file's name without its extension, as a starting alt text. */
const altFromName = (name: string) => name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();

/**
 * The image picker. `projectId` and `nodeId` say which note an uploaded file
 * is attached to; without them only "Paste a link" is offered.
 */
export function ImagePickerDialog({
  open,
  onOpenChange,
  onPick,
  projectId,
  nodeId,
  title = "Add a picture",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (image: PickedImage) => void;
  projectId?: string;
  nodeId?: string;
  title?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const canUpload = Boolean(projectId && nodeId);

  const close = (next: boolean) => {
    if (uploading) return;
    if (!next) {
      setLink("");
      setError(null);
    }
    onOpenChange(next);
  };

  const done = (image: PickedImage) => {
    setLink("");
    setError(null);
    onPick(image);
    onOpenChange(false);
  };

  const upload = async (file: File | undefined) => {
    if (!file || !projectId || !nodeId) return;
    if (!isImage({ contentType: file.type })) {
      setError("That file isn't a picture Plotra can show. Try a PNG, JPEG, GIF, WebP or AVIF.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const row = await uploadAttachment(projectId, nodeId, file);
      setUploading(false);
      done({ url: fileUrl(row.id), alt: altFromName(file.name) });
    } catch (e) {
      setUploading(false);
      setError(errorText(e, "The picture couldn't be uploaded. Try again."));
    }
  };

  const submitLink = () => {
    const checked = checkImageLink(link);
    if ("error" in checked) setError(checked.error);
    else done({ url: checked.url, alt: "" });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{canUpload ? "Upload one from your computer, or paste a link to one on the web." : "Paste a link to a picture on the web."}</DialogDescription>
        </DialogHeader>
        {canUpload && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
              className="hidden"
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()} className="justify-center">
              <Icon name="upload-linear" className="size-4" />
              {uploading ? "Uploading…" : "Upload from computer"}
            </Button>
            <p className="text-center text-meta text-muted-foreground">or</p>
          </>
        )}
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submitLink();
          }}
        >
          <Field label="Paste a link">
            <Input
              value={link}
              autoFocus={!canUpload}
              inputMode="url"
              placeholder="https://…"
              disabled={uploading}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "image-picker-error" : undefined}
              onChange={(e) => {
                setLink(e.target.value);
                if (error) setError(null);
              }}
            />
          </Field>
          {error && (
            <p id="image-picker-error" role="alert" className="text-ui-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={uploading}>
              Use this link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
