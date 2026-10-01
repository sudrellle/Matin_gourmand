import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matin Gourmand | La douceur du fait maison",
  description:
    "Viennoiseries, pâtisseries et pains préparés chaque matin. Commandez en ligne chez Matin Gourmand.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
