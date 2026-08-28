import { redirect } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";

// Postventa viaja con rol `comercial` —así lo decidió Carlos el 25-08 para no
// inventar un rol nuevo mientras se entiende qué hace el área— y lo que separa
// sus pantallas de las de un vendedor es la marca del perfil, no el rol. Un
// comercial que llegue acá por la URL vuelve a lo suyo.
//
// `hace_postventa` (0093) ya NO abre esta puerta. Es el caso de Ariana: vende
// mantenimiento y repuestos, pero no ejecuta el servicio —«ellos no hacen eso:
// solamente venden. Termino de vender, sigo mi cierre y ya» (Carlos, 27-08)—.
// Su trabajo de postventa vive en su pipeline comercial, donde la 0095 le deja
// abrir la ficha del cliente aunque la cuenta sea de otro.
export default async function PostventaLayout({ children }: { children: React.ReactNode }) {
  const perfil = await requerirPerfil();
  // La cuenta de soporte (0101) entra: su trabajo es que los demás sepan usar
  // estas pantallas, y no se puede enseñar lo que no se ve.
  if (!perfil.es_postventa && !perfil.es_soporte && perfil.rol !== "gerencia" && perfil.rol !== "admin") {
    redirect(perfil.rol === "central" ? "/central" : "/comercial");
  }
  return <>{children}</>;
}
