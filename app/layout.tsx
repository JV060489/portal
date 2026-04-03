import type { Metadata } from "next";
import { Lexend, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TRPCReactProvider } from "@/trpc/client";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
});



export const metadata: Metadata = {
  title: "Portal",
  description: "Scene Creation in Web",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark font-sans", "font-sans", geist.variable)}>
      <body
        className={`${lexend.variable} antialiased`}
      >
        <TRPCReactProvider>
          {children}
        </TRPCReactProvider>
      </body>
    </html>
  );
}
