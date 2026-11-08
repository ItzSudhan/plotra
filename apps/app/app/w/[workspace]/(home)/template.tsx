import { Screen } from "@/components/transitions";

// Projects and the workspace's settings slide past one another under the header, which stays put (components/transitions.tsx).
export default function Template({ children }: { children: React.ReactNode }) {
  return <Screen>{children}</Screen>;
}
