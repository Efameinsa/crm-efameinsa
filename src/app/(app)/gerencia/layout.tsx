import { requerirRol } from "@/lib/auth";

export default async function GerenciaLayout({ children }: { children: React.ReactNode }) {
  await requerirRol(["gerencia", "admin"]);
  return <>{children}</>;
}
