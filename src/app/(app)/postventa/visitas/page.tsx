import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ListaVisitasPlanta, type VisitaFila } from "@/components/crm/lista-visitas-planta";

export const dynamic = "force-dynamic";

/**
 * Quién viene a la planta, visto desde postventa (Carlos, 16-09).
 *
 * «Tú mañana faltas, me cedes la posta… lo primero que tengo que ver es
 * quiénes van a venir a la empresa». Es la misma lista que imprime Central,
 * sin los botones de imprimir y cancelar: acá se mira. Se registran desde la
 * ficha del cliente («Viene a la planta»).
 */
export default async function VisitasPostventaPage() {
  await requerirPerfil();
  const supabase = await createClient();
  const hoy = hoyLima();
  const columnas = "id, empresa, ruc, persona, dni, telefono, motivo, fecha, hora, registrado_at, impreso_at, cancelada_at, cancelada_motivo, cuenta_id, showroom, prender_tv, infocorp, cotizacion_ref, acompanantes, equipo_a_ver, quitar_film, infocorp_enviado_at, showroom_listo_at, film_retirado_at, tv_listo_at, llego_at, no_vino_at, reembalado_at, notas_central, perfiles!visitas_planta_registrado_por_fkey(nombre, codigo_comercial)";
  const [{ data: proximas }, { data: pasadas }] = await Promise.all([
    supabase.from("visitas_planta").select(columnas).gte("fecha", hoy).order("fecha").order("hora", { nullsFirst: false }).limit(200),
    supabase.from("visitas_planta").select(columnas).lt("fecha", hoy).order("fecha", { ascending: false }).limit(40),
  ]);
  const mapear = (v: unknown): VisitaFila => {
    const x = v as Omit<VisitaFila, "registradoPor"> & { perfiles: { nombre: string; codigo_comercial: string | null } | null };
    return {
      ...x,
      registradoPor: x.perfiles ? `${x.perfiles.codigo_comercial ? x.perfiles.codigo_comercial + " · " : ""}${x.perfiles.nombre}` : "—",
    };
  };
  return (
    <div className="space-y-4">
      <SeccionPanel titulo="Quién viene a la planta">
        <p className="mb-3 text-xs text-muted-foreground">
          Las visitas que registraron comerciales y postventa desde la ficha del cliente («Viene a la planta»).
          Central las imprime para vigilancia; acá se ven para saber a quién se espera.
        </p>
        <ListaVisitasPlanta visitas={(proximas ?? []).map(mapear)} hoy={hoy} modo="lectura" />
      </SeccionPanel>
      {(pasadas ?? []).length > 0 && (
        <SeccionPanel titulo="Visitas anteriores">
          <ListaVisitasPlanta visitas={(pasadas ?? []).map(mapear)} hoy={hoy} pasadas modo="lectura" />
        </SeccionPanel>
      )}
    </div>
  );
}
