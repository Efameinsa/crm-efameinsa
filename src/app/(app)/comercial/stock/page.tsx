import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { CatalogoOperaciones } from "@/components/crm/catalogo-operaciones";
import { cargarCatalogo } from "@/lib/catalogo-operaciones";
import { puedeVerPrecios } from "@/lib/postventa";

export const dynamic = "force-dynamic";

/**
 * LA VENTANA DE STOCK DEL COMERCIAL (gerencia, reunión del 20-10-2026 15:45):
 * «En el CRM tiene que haber una ventana de stock… hasta que lleguemos al ERP
 * estamos bien lejos… el comercial necesita el stock».
 *
 * Es el mismo catálogo que consulta el almacén, en solo lectura: cada equipo
 * con su stock (contado por serie en el almacén cuando ya está cargado, o la
 * cifra de referencia del Excel mientras tanto, y la tarjeta dice cuál es).
 * Lo que falta o está mal se le pide a Lesly con «Pedir a Lesly».
 */
export default async function StockComercialPage() {
  const perfil = await requerirPerfil();
  // La tarjeta lleva el precio: quien no ve precios (postventa) consulta el stock desde el cotizador.
  if (!puedeVerPrecios(perfil)) {
    return (
      <SeccionPanel titulo="Stock de equipos">
        <p className="text-sm text-muted-foreground">
          Esta vista lleva los precios del catálogo y es para el área comercial. El stock de cada equipo también se ve al
          buscarlo en el cotizador.
        </p>
      </SeccionPanel>
    );
  }
  const supabase = await createClient();
  const { equipos, salud } = await cargarCatalogo(supabase);
  return (
    <SeccionPanel titulo="Stock de equipos">
      <p className="mb-3 max-w-prose text-xs text-muted-foreground">
        «En almacén» es lo que el almacén tiene registrado por número de serie. «(ref.)» es la cifra del último Excel de
        stock: sirve de guía, confírmela con Lesly antes de prometer una fecha. Si un equipo no está o el dato no cuadra,
        pídalo con «Pedir a Lesly».
      </p>
      <CatalogoOperaciones equipos={equipos} salud={salud} soloLectura />
    </SeccionPanel>
  );
}
