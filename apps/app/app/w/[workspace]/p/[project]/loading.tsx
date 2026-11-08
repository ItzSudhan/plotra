import { ShellSkeleton } from "@/components/skeletons";

// Opening a project loads its whole binder, so its outline appears at once while that happens.
export default function Loading() {
  return <ShellSkeleton />;
}
