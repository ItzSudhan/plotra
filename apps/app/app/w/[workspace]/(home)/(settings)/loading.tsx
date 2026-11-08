import { WorkspaceSettingsSkeleton } from "@/components/skeletons";

// Shown while the settings first open. Moving between tabs keeps the heading
// and tabs in place (settings/layout.tsx) and shows settings/loading.tsx instead.
export default function Loading() {
  return <WorkspaceSettingsSkeleton />;
}
