import { requerirRol } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Operaciones entra por el catálogo —«ella puede agregar productos»—; las
  // pantallas de usuarios se guardan solas con su propio requerirRol(["admin"]).
  // Gerencia entra solo a la auditoría del asistente (15-10): cada página de
  // acá tiene su propio requerirRol y las demás no la dejan pasar.
  await requerirRol(["admin", "operaciones", "gerencia"]);
  return <>{children}</>;
}
