import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/Navbar";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BuildProof — AI-Powered Construction Escrow",
  description:
    "Decentralized AI adjudication for construction payment disputes on GenLayer. Smart escrow released only when validators confirm completion.",
  keywords: [
    "BuildProof",
    "construction escrow",
    "GenLayer",
    "AI adjudication",
    "smart contract",
    "decentralized",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans`}>
        <Providers>
          <Navbar />
          <main className="min-h-screen pt-16">{children}</main>
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast:
                  "bg-bp-dark border border-white/10 text-white text-sm rounded-xl shadow-xl shadow-black/30",
                description: "text-white/60",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
