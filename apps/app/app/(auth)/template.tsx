import { Screen } from "@/components/transitions";

// Sign in and sign up cross over on the same white page and its painted story (components/transitions.tsx).
export default function Template({ children }: { children: React.ReactNode }) {
  return <Screen>{children}</Screen>;
}
