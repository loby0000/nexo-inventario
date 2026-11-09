import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Nexo · Inventario",
  description:
    "Tu inventario, bajo control. Productos, movimientos y reportes para tu negocio.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
