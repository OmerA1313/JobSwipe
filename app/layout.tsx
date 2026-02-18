import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Job Swipe MVP",
  description: "Tinder-like job discovery and apply workflow"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
