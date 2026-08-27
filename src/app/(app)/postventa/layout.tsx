import { redirect } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";

// Postventa viaja con rol `comercial` —así lo decidió Carlos el 25-08 para no
// inventar un rol nuevo mientras se entiende qué hace el área— y lo que separa
// sus pantallas de las de un vendedor es la marca del perfil, no el rol. Un
// comercial que llegue acá por la URL vuelve a lo suyo.
export default async function PostventaLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requerirPerfil();
  if (!perfil.es_postventa && !perfil.hace_postventa && perfil.rol !== "gerencia" && perfil.rol !== "admin") {
    redirect(perfil.rol === "central" ? "/central" : "/comercial");
  }
  return <>{children}</>;
}
