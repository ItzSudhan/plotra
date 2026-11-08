import { Screen } from "@/components/transitions";

// From one project straight into another, as from a notification (components/transitions.tsx).
export default function Template({ children }: { children: React.ReactNode }) {
  return <Screen>{children}</Screen>;
}
