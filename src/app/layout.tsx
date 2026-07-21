import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { StoreHydration } from "@/components/store-hydration";
import { SectionMemory } from "@/components/section-memory";
import { Toaster } from "@/components/ui/sonner";
import packageJson from "../../package.json";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://keepgoing.you"),
  title: "Keep Going — break big goals into small steps",
  description: "Decompose a goal into groups and steps, and make progress one step at a time.",
  openGraph: {
    title: "Keep Going — break big goals into small steps",
    description: "Decompose a goal into groups and steps, and make progress one step at a time.",
    url: "/",
    siteName: "Keep Going",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ClerkProvider>
          <StoreHydration />
          <SectionMemory />
          {children}
          <footer className="mt-auto flex items-center justify-center gap-3 py-2 text-center text-xs text-muted-foreground">
            <Link href="/about" className="transition-colors hover:text-foreground">
              About
            </Link>
            <span aria-hidden>·</span>
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <span aria-hidden>·</span>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <span aria-hidden>·</span>
            <span>v{packageJson.version}</span>
          </footer>
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  );
}
