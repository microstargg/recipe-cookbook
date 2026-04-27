import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { Providers } from "@/components/providers";
import "@neondatabase/auth/ui/css";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: {
    default: "Ben's Cookbook",
    template: "%s · Ben's Cookbook",
  },
  description: "Ben's personal recipe collection — save, import, and cook.",
  applicationName: "Ben's Cookbook",
  openGraph: {
    title: "Ben's Cookbook",
    description: "Personal recipe collection — save, import, and cook.",
    siteName: "Ben's Cookbook",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${display.variable} ${sans.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
