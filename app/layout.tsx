import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Uploader",
  description: "Upload customer CRM CSVs and export filtered data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
