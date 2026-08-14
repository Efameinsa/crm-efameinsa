import { requerirRol } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requerirRol(["admin"]);
  return <>{children}</>;
}
