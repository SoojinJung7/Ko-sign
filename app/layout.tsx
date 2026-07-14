import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getLocale, getDictionary } from "@/lib/i18n/server";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { I18nProvider } from "@/lib/i18n/provider";
import { LanguageToggle } from "@/components/brand/LanguageToggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: {
      default: t.meta.title,
      template: "%s · Ko-sign",
    },
    description: t.meta.description,
    applicationName: "Ko-sign",
    authors: [{ name: "Ko-sign" }],
    keywords: [
      "e-signature",
      "electronic signature",
      "sign PDF",
      "document signing",
      "Ko-sign",
    ],
    icons: { icon: "/favicon.ico" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0b12" },
  ],
  colorScheme: "light dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const dict = dictionaries[locale];
  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <I18nProvider locale={locale} dict={dict}>
          <LanguageToggle />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
