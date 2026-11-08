import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";
import { getLocale, getMessages, getT } from "@/i18n/server";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { default: "MissionHub", template: "%s · MissionHub" },
    description: (await getT("auth"))("app.description"),
  };
}

// Applies the stored/system theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('mh-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html lang={INTL_LOCALE[locale]} className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <I18nProvider locale={locale} messages={messages}>
          {children}
          <Toaster position="bottom-right" />
        </I18nProvider>
      </body>
    </html>
  );
}
