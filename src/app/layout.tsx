import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
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
  title: "Goals — break big things into steps",
  description: "Decompose a goal into groups and steps, and make progress one step at a time.",
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
        <StoreProvider>
          {children}
          <footer className="mt-auto py-2 text-center text-xs text-muted-foreground">
            Current version of application v{packageJson.version}
          </footer>
        </StoreProvider>
        <Toaster />
      </body>
    </html>
  );
}
