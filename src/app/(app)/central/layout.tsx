import { requerirRol } from "@/lib/auth";

export default async function CentralLayout({ children }: { children: React.ReactNode }) {
  await requerirRol(["central", "gerencia", "admin"]);
  return <>{children}</>;
}
