import { Screen } from "@/components/transitions";

// A workspace's projects page and a project open into one another, and switching workspace crosses over (components/transitions.tsx).
export default function Template({ children }: { children: React.ReactNode }) {
  return <Screen>{children}</Screen>;
}
