import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ListaVisitasPlanta, type VisitaFila } from "@/components/crm/lista-visitas-planta";

export const dynamic = "force-dynamic";

/**
 * Quién viene a la planta (0238).
 *
 * Carlos, 15-09: «todo eso lo lanza a la central, y la central ya hace su
 * trabajo de imprimirlo, lo lleva al vigilante, para saber que va a ingresar
 * una persona A, persona B». Las de hoy y las que vienen, con un botón que
 * imprime la hoja para la puerta y deja marcado que ya se imprimió.
 */
export default async function VisitasPlantaPage() {
  await requerirRol(["central", "gerencia", "admin", "operaciones"]);
  const supabase = await createClient();
  const hoy = hoyLima();

  const [{ data: proximas }, { data: pasadas }] = await Promise.all([
    supabase
      .from("visitas_planta")
      .select("id, empresa, ruc, persona, dni, telefono, motivo, fecha, hora, registrado_at, impreso_at, cancelada_at, cancelada_motivo, cuenta_id, perfiles!visitas_planta_registrado_por_fkey(nombre, codigo_comercial)")
      .gte("fecha", hoy)
      .order("fecha")
      .order("hora", { nullsFirst: false })
      .limit(200),
    supabase
      .from("visitas_planta")
      .select("id, empresa, ruc, persona, dni, telefono, motivo, fecha, hora, registrado_at, impreso_at, cancelada_at, cancelada_motivo, cuenta_id, perfiles!visitas_planta_registrado_por_fkey(nombre, codigo_comercial)")
      .lt("fecha", hoy)
      .order("fecha", { ascending: false })
      .limit(60),
  ]);

  const mapear = (v: unknown): VisitaFila => {
    const x = v as Omit<VisitaFila, "registradoPor"> & { perfiles: { nombre: string; codigo_comercial: string | null } | null };
    return {
      id: x.id, empresa: x.empresa, ruc: x.ruc, persona: x.persona, dni: x.dni, telefono: x.telefono, motivo: x.motivo,
      fecha: x.fecha, hora: x.hora, registrado_at: x.registrado_at, impreso_at: x.impreso_at, cancelada_at: x.cancelada_at,
      cancelada_motivo: x.cancelada_motivo, cuenta_id: x.cuenta_id,
      registradoPor: x.perfiles ? `${x.perfiles.codigo_comercial ? x.perfiles.codigo_comercial + " · " : ""}${x.perfiles.nombre}` : "—",
    };
  };

  return (
    <div className="space-y-4">
      <SeccionPanel titulo="Visitas a la planta">
        <p className="mb-3 text-xs text-muted-foreground">
          Lo que registran comerciales y postventa cuando un cliente viene. Se imprime para vigilancia; queda marcado
          cuándo se imprimió.
        </p>
        <ListaVisitasPlanta visitas={(proximas ?? []).map(mapear)} hoy={hoy} />
      </SeccionPanel>
      {(pasadas ?? []).length > 0 && (
        <SeccionPanel titulo="Visitas anteriores">
          <ListaVisitasPlanta visitas={(pasadas ?? []).map(mapear)} hoy={hoy} pasadas />
        </SeccionPanel>
      )}
    </div>
  );
}
