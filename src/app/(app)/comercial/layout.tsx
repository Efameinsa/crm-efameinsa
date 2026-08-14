import { requerirRol } from "@/lib/auth";

export default async function ComercialLayout({ children }: { children: React.ReactNode }) {
  await requerirRol(["comercial", "gerencia", "admin"]);
  return <>{children}</>;
}
