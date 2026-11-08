import { Screen } from "@/components/transitions";

// The reader's front page and its notes cross over beside the contents, which stay put (components/transitions.tsx).
export default function Template({ children }: { children: React.ReactNode }) {
  return <Screen>{children}</Screen>;
}
