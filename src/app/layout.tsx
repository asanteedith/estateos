import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EstateOS", template: "%s · EstateOS" },
  description: "Listings, enquiries and a simple CRM for real estate agencies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
