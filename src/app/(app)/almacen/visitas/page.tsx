import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ListaVisitasPlanta, type VisitaFila, COLUMNAS_VISITA } from "@/components/crm/lista-visitas-planta";

export const dynamic = "force-dynamic";

/** Quién viene a la planta, visto desde el almacén (0246): «que me lleguen las visitas» (Lesly, 16-09). */
export default async function VisitasAlmacenPage() {
  await requerirPerfil();
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
      <p className="mb-3 text-xs text-muted-foreground">
        Clientes anunciados por comerciales y postventa: a ver equipos, a recoger repuestos o a pagar. Central imprime la
        hoja para vigilancia.
      </p>
      <ListaVisitasPlanta visitas={filas} hoy={hoy} modo="almacen" />
    </SeccionPanel>
  );
}
