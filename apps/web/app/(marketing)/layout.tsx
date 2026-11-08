import { Footer } from "@/components/marketing/footer";
import { MotionProvider } from "@/components/marketing/motion-provider";
import { Nav } from "@/components/marketing/nav";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <MotionProvider>
      <div className="flex min-h-full flex-col overflow-x-clip">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </MotionProvider>
  );
}
