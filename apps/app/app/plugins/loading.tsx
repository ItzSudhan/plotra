import { PluginStoreSkeleton } from "@/components/skeletons";

// In the desktop app the store is plotra.ink's, over the network, so this can take a moment.

export default function Loading() {
  return <PluginStoreSkeleton />;
}
