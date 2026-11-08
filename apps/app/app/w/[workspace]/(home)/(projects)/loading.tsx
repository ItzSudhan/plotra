import { ProjectsSkeleton } from "@/components/skeletons";

// In a group of its own, so only this page shows project cards while loading, and not the workspace's settings beside it.
export default function Loading() {
  return <ProjectsSkeleton />;
}
