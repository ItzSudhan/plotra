import { Screen } from "@/components/transitions";

// From one note of the reader to the next (components/transitions.tsx).
export default function Template({ children }: { children: React.ReactNode }) {
  return <Screen>{children}</Screen>;
}
