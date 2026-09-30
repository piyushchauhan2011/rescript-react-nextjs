import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Elsewhere — considered stays",
  description: "Considered stays, remarkable places.",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
