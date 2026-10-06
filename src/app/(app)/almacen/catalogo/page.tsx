import { redirect } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { CatalogoOperaciones } from "@/components/crm/catalogo-operaciones";
import { cargarCatalogo } from "@/lib/catalogo-operaciones";

export const dynamic = "force-dynamic";

/**
 * El catálogo del almacén: para CONSULTAR (Lesly, 06-10).
 *
 * «Que almacén (Jeysson) tenga la vista de catálogo solo para ver la
 * información, mas no para subir o editar». Es la misma pantalla de Lesly
 * —mismo buscador, mismos filtros, mismas tarjetas con foto, precio y stock—
 * en modo solo lectura: sin «Cargar un equipo», sin «Subir ficha», sin el ⋮.
 * Lo que la pantalla no muestra, las acciones de servidor tampoco lo aceptan
 * (`acciones/productos.ts`), y la RLS de `productos` ya lo negaba (0116).
 *
 * El layout de /almacen no frena la página: la puerta se valida acá también.
 */
export default async function CatalogoAlmacenPage() {
  const perfil = await requerirPerfil();
  const entra =
    perfil.es_almacen || perfil.es_operaciones || perfil.es_soporte || ["operaciones", "gerencia", "admin"].includes(perfil.rol);
  if (!entra) redirect(perfil.rol === "central" ? "/central" : perfil.es_postventa ? "/postventa/macro" : "/comercial");

  const supabase = await createClient();
  const { equipos, salud } = await cargarCatalogo(supabase);

  return (
    <SeccionPanel titulo="El catálogo">
      <CatalogoOperaciones equipos={equipos} salud={salud} soloLectura />
    </SeccionPanel>
  );
}
