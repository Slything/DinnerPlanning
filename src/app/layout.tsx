import type { Metadata, Viewport } from "next";
import "@/app/globals.css";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

export const metadata: Metadata = {
  title: "Dinner Made Easy",
  description: "Plan dinner together, shop once, and make every recipe better.",
  applicationName: "Dinner Made Easy",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Dinner Made Easy"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f0e6"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
