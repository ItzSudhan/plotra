import { exportRequest } from "@/lib/io/export-request";

// GET /api/export?project=<id>&format=…: a project, a folder or a note as a
// file to download, for the signed-in person. What it takes is described in
// lib/io/export-request.ts, shared with the phone's /api/mobile/export.
export function GET(request: Request) {
  return exportRequest(request);
}
