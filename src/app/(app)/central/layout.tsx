import { requerirRol } from "@/lib/auth";

export default async function CentralLayout({ children }: { children: React.ReactNode }) {
  // OPERACIONES TAMBIÉN ENTRA. Lesly recibió el aviso de que le pedían
  // anular un cierre, tocó la notificación y el sistema la devolvió a su
  // panel: el botón para anular vive en la pantalla de Central y su rol no
  // entraba (reportado el 04-09 por la tarde, caso Sierra Travel). Anular,
  // corregir una derivación y autorizar ya eran suyos desde la 0116; lo que
  // faltaba era la puerta. Lo que ve dentro lo sigue decidiendo la base.
  await requerirRol(["central", "gerencia", "admin", "operaciones"]);
  return <>{children}</>;
}
