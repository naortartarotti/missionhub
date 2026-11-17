import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";
import { getLocale, getMessages, getT } from "@/i18n/server";
import { ThemeScript } from "./theme-script";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { default: "Workatent", template: "%s · Workatent" },
    description: (await getT("auth"))("app.description"),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html lang={INTL_LOCALE[locale]} className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        <ThemeScript nonce={nonce} />
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
