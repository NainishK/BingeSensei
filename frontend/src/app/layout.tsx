import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bingesensei.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: `${siteUrl}/`,
  },
  title: {
    default: "BingeSensei – Streaming Subscription Tracker & Watchlist Manager",
    template: "%s | BingeSensei",
  },
  description: "Discover what to watch, manage streaming subscriptions, track expenses, organize watchlists, and get personalized recommendations with BingeSensei.",
  keywords: [
    "BingeSensei",
    "Binge Sensei",
    "streaming subscription tracker",
    "OTT subscription manager",
    "watchlist tracker",
    "streaming service rotator",
    "streaming budget app",
    "where to watch",
    "streaming recommendations",
    "personalized recommendations",
    "Netflix cost tracker",
    "Prime Video watchlist"
  ],
  authors: [{ name: "BingeSensei Team" }],
  creator: "BingeSensei",
  publisher: "BingeSensei",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: `${siteUrl}/`,
    siteName: "BingeSensei",
    title: "BingeSensei – Streaming Subscription Tracker & Watchlist Manager",
    description: "Discover what to watch, manage streaming subscriptions, track expenses, organize watchlists, and get personalized recommendations with BingeSensei.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "BingeSensei – Streaming Subscription Tracker & Watchlist Manager",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BingeSensei – Streaming Subscription Tracker & Watchlist Manager",
    description: "Discover what to watch, manage streaming subscriptions, track expenses, organize watchlists, and get personalized recommendations with BingeSensei.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  appleWebApp: {
    title: "BingeSensei",
    statusBarStyle: "black-translucent",
    capable: true,
  },
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION && {
    verification: {
      google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    },
  }),
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      "name": "BingeSensei",
      "url": `${siteUrl}/`,
      "logo": {
        "@type": "ImageObject",
        "@id": `${siteUrl}/#logo`,
        "url": `${siteUrl}/logo-dark-theme-final-v3.png`,
        "contentUrl": `${siteUrl}/logo-dark-theme-final-v3.png`,
        "caption": "BingeSensei Logo",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      "url": `${siteUrl}/`,
      "name": "BingeSensei",
      "alternateName": ["Binge Sensei", "BingeSensei App"],
      "description": "Streaming Subscription Tracker & Watchlist Manager",
      "publisher": {
        "@id": `${siteUrl}/#organization`,
      },
      "inLanguage": "en-US",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#software`,
      "name": "BingeSensei",
      "url": `${siteUrl}/`,
      "applicationCategory": "EntertainmentApplication, FinanceApplication",
      "operatingSystem": "Web, iOS, Android",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
      },
      "description": "Discover what to watch, manage streaming subscriptions, track expenses, organize watchlists, and get personalized recommendations with BingeSensei.",
      "author": {
        "@id": `${siteUrl}/#organization`,
      },
      "publisher": {
        "@id": `${siteUrl}/#organization`,
      },
    },
  ],
};

import GoogleAnalytics from "@/components/GoogleAnalytics";
import MicrosoftClarity from "@/components/MicrosoftClarity";
import CookieBanner from "@/components/CookieBanner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
        <ThemeProvider defaultTheme="system" storageKey="bingesensei-theme">
          <GoogleAnalytics />
          <MicrosoftClarity />
          {children}
          <CookieBanner />
        </ThemeProvider>
      </body>
    </html>
  );
}
