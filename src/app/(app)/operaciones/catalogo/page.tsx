import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { CatalogoOperaciones } from "@/components/crm/catalogo-operaciones";
import { cargarCatalogo } from "@/lib/catalogo-operaciones";

export const dynamic = "force-dynamic";

/**
 * El catálogo de quien lo mantiene (28-08).
 *
 * «No entiendo la vista de catálogos, veo solo una lista. ¿No deberían estar
 * ahí un buscador con todos los productos como lo tienen las comerciales, para
 * comprobar que todo está correcto? ¿Una vista previa de cómo quedaría una
 * cotización en borrador?» — y tenía razón: lo que había era una tabla
 * alfabética de lo que existe, que sirve para leer y no para revisar.
 *
 * Esta pantalla contesta las tres preguntas de quien cuida el catálogo:
 * ¿lo encuentra el comercial?, ¿sale bien impreso?, ¿qué está incompleto?
 */
export default async function CatalogoPage() {
  const perfil = await requerirPerfil();
  if (!["operaciones", "gerencia", "admin"].includes(perfil.rol)) redirect("/comercial");

  const supabase = await createClient();
  const { equipos, salud } = await cargarCatalogo(supabase);

  return (
    <SeccionPanel
      titulo="El catálogo"
      accion={
        <Link
          href="/admin/productos"
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-3.5" /> Cargar un equipo
        </Link>
      }
    >
      <CatalogoOperaciones equipos={equipos} salud={salud} />
    </SeccionPanel>
  );
}
