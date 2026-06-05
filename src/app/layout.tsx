import type { Metadata, Viewport } from "next";
import "@/app/globals.css";
import { DemoStoreProvider } from "@/lib/demo/store";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

export const metadata: Metadata = {
  title: "Gather & Graze",
  description: "Plan dinner together, shop once, and make every recipe better.",
  applicationName: "Gather & Graze",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Gather & Graze"
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
        <DemoStoreProvider>
          {children}
          <ServiceWorkerRegistration />
        </DemoStoreProvider>
      </body>
    </html>
  );
}

