import { requerirRol } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Operaciones entra por el catálogo —«ella puede agregar productos»—; las
  // pantallas de usuarios se guardan solas con su propio requerirRol(["admin"]).
  await requerirRol(["admin", "operaciones"]);
  return <>{children}</>;
}
