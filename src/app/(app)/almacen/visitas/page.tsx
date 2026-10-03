import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ListaVisitasPlanta, type VisitaFila } from "@/components/crm/lista-visitas-planta";
import { COLUMNAS_VISITA } from "@/lib/visitas-planta-columnas";
import { VisitaProveedorBoton } from "@/components/crm/visita-proveedor-boton";

export const dynamic = "force-dynamic";

/** Quién viene a la planta, visto desde el almacén (0246): «que me lleguen las visitas» (Lesly, 16-09). */
export default async function VisitasAlmacenPage() {
  const perfil = await requerirPerfil();
  // El almacén y quien lo supervisa (operaciones, gerencia) registran al proveedor.
  const puedeRegistrar = Boolean(perfil.es_almacen) || Boolean(perfil.es_operaciones) || ["gerencia", "admin", "operaciones"].includes(perfil.rol);
  const supabase = await createClient();
  const hoy = hoyLima();
  const columnas = COLUMNAS_VISITA;
  const { data } = await supabase.from("visitas_planta").select(columnas).gte("fecha", hoy).order("fecha").order("hora", { nullsFirst: false }).limit(200);
  const filas = (data ?? []).map((v: unknown): VisitaFila => {
    const x = v as Omit<VisitaFila, "registradoPor"> & { perfiles: { nombre: string; codigo_comercial: string | null } | null };
    return { ...x, registradoPor: x.perfiles ? `${x.perfiles.codigo_comercial ? x.perfiles.codigo_comercial + " · " : ""}${x.perfiles.nombre}` : "—" };
  });
  return (
    <SeccionPanel titulo="Quién viene a la planta">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Clientes anunciados por comerciales y postventa: a ver equipos, a recoger repuestos o a pagar. Y los proveedores
          que registra el almacén. Central imprime la hoja para vigilancia.
        </p>
        {/* Lesly, 03-10: «almacén no tiene para registrar la visita de proveedores a planta» (0386). */}
        {puedeRegistrar && <VisitaProveedorBoton />}
      </div>
      <ListaVisitasPlanta visitas={filas} hoy={hoy} modo="almacen" />
    </SeccionPanel>
  );
}
