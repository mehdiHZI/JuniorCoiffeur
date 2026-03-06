import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PWARegister } from "./components/PWARegister";
import { InstallPWAButton } from "./components/InstallPWAButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#111",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Chriscut – Fidélité coiffeur",
  description: "Gère tes points fidélité et tes visites chez le coiffeur",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Chriscut",
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link rel="apple-touch-icon" href="/chriscut-logo.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PWARegister />
        <InstallPWAButton />
        <div
          style={{
            position: "fixed",
            top: "12px",
            right: "16px",
            zIndex: 80,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/chriscut-logo.png"
            alt="Logo Chriscut"
            style={{ height: "44px" }}
          />
        </div>
        {children}
      </body>
    </html>
  );
}
