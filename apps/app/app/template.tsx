import { Screen } from "@/components/transitions";

// Each part of the app (a workspace, Your settings, Shared with you, signing
// in, a public reader) leaves and arrives as one page (components/transitions.tsx).
export default function Template({ children }: { children: React.ReactNode }) {
  return <Screen>{children}</Screen>;
}
