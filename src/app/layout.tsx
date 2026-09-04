import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Uma família só (docs/04). Variável, para pesar pouco no celular do funcionário.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Portal 3e",
  description: "Portal de gestão de funcionários terceirizados da 3e Gestão de Pessoas.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom de 200% precisa funcionar (docs/04 — acessibilidade).
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col text-base">{children}</body>
    </html>
  );
}
