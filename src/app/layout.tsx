import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { Toaster } from "sonner";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL || "https://chanv-apps-hub-271227085398.northamerica-northeast1.run.app";

export const metadata: Metadata = {
  title: "Palantir — Chanv",
  description: "Palantir — Groupe Chanv",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Palantir",
  },
};

export const viewport = {
  themeColor: "#282828",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${outfit.variable}`}>
      <body className="min-h-screen antialiased font-sans">
        <AuthProvider>
          {children}
          <Toaster richColors position="top-right" />
        </AuthProvider>
        {/* Hub Widgets */}
        <Script id="chanv-auth-bridge" strategy="beforeInteractive">{`
          window.getAuthToken = async function() {
            try {
              const { getAuth } = await import('firebase/auth');
              const auth = getAuth();
              if (auth.currentUser) return await auth.currentUser.getIdToken();
            } catch(e) {}
            return null;
          };
        `}</Script>
        <Script src={`${HUB_URL}/widgets/chatbot.js`} data-hub={HUB_URL} strategy="lazyOnload" />
        <Script src={`${HUB_URL}/widgets/feedback.js`} data-hub={HUB_URL} strategy="lazyOnload" />
        <Script src={`${HUB_URL}/js/gandalf-widget.js`} data-hub={HUB_URL} strategy="lazyOnload" />
        {/* Service worker — rend la PWA installable */}
        <Script id="register-sw" strategy="afterInteractive">{`
          if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(err => {
                console.warn('SW registration failed:', err);
              });
            });
          }
        `}</Script>
      </body>
    </html>
  );
}
