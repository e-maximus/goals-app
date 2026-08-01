import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/layout/site-footer";
import { Toaster } from "@/components/ui/sonner";
import { SectionMemory } from "@/features/goals";
import { SITE_URL } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  // Every page below sets a bare title ("Tasks", a goal's name); the template
  // gives them all the same suffix, and `default` covers the ones that don't.
  title: {
    default: "Keep Going — break big goals into small steps",
    template: "%s — Keep Going",
  },
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
          <SectionMemory />
          {children}
          <SiteFooter />
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  );
}
