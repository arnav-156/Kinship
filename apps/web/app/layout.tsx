import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Kinship - Relationship Intelligence",
  description: "Evidence-backed relationship intelligence and human-reviewed outreach.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
