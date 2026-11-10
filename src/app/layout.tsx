import type { Metadata } from "next";
import { WikiShell } from "@/components/WikiShell";
import { navigation } from "@/lib/content";
import type { NavItem } from "@/lib/types";
import "./globals.css";

export const metadata: Metadata = { title: { default: "Wiki AP5", template: "%s · Wiki AP5" }, description: "Documentación funcional interactiva de AP5" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let items: NavItem[] = [];
  try { items = await navigation(); } catch { items = []; }
  return <html lang="es"><body><WikiShell navigation={items}>{children}</WikiShell></body></html>;
}
