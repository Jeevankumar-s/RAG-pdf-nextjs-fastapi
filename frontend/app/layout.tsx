import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ReactQueryProvider from "@/providers/ReactQueryProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: {
    default: "RAG PDF Chat",
    template: "%s | RAG PDF Chat",
  },
  description:
    "Upload a PDF and ask document-scoped questions with a streaming AI assistant powered by retrieval augmented generation.",
  applicationName: "RAG PDF Chat",
  keywords: [
    "RAG",
    "PDF chat",
    "document question answering",
    "AI assistant",
    "Next.js",
    "FastAPI",
  ],
  authors: [{ name: "RAG PDF Chat" }],
  creator: "RAG PDF Chat",
  publisher: "RAG PDF Chat",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "RAG PDF Chat",
    title: "RAG PDF Chat",
    description:
      "Upload a PDF and ask document-scoped questions with a streaming AI assistant.",
  },
  twitter: {
    card: "summary",
    title: "RAG PDF Chat",
    description:
      "Upload a PDF and ask document-scoped questions with a streaming AI assistant.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ReactQueryProvider>{children}</ReactQueryProvider>
      </body>
    </html>
  );
}
