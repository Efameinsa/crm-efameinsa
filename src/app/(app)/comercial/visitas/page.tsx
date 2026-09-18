import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ListaVisitasPlanta, type VisitaFila, COLUMNAS_VISITA } from "@/components/crm/lista-visitas-planta";

export const dynamic = "force-dynamic";

/**
 * Las visitas del comercial (0256). Hasta hoy el comercial registraba la
 * visita desde la ficha y no volvía a verla: no tenía dónde. Carlos, 18-09:
 * «tiene visitas nuestro amigo Moisés, pero no veo que haya planificado…
 * ¿dónde yo como gestor genero la visita?». Acá ve las suyas con el circuito
 * (anunciada → vigilancia → preparada → llegó → registrada) y cierra cada una
 * con su resultado, que queda como gestión en la oportunidad del cliente.
 * Ve solo las que registró (RLS `visitas_planta_select`).
 */
export default async function VisitasComercialPage() {
  await requerirPerfil();
  const supabase = await createClient();
  const hoy = hoyLima();
  const [{ data: proximas }, { data: pasadas }] = await Promise.all([
    supabase.from("visitas_planta").select(COLUMNAS_VISITA).gte("fecha", hoy).order("fecha").order("hora", { nullsFirst: false }).limit(100),
    supabase.from("visitas_planta").select(COLUMNAS_VISITA).lt("fecha", hoy).order("fecha", { ascending: false }).limit(40),
  ]);
  const mapear = (v: unknown): VisitaFila => {
    const x = v as Omit<VisitaFila, "registradoPor"> & { perfiles: { nombre: string; codigo_comercial: string | null } | null };
    return { ...x, registradoPor: x.perfiles ? `${x.perfiles.codigo_comercial ? x.perfiles.codigo_comercial + " · " : ""}${x.perfiles.nombre}` : "—" };
  };
  const sinCerrar = (pasadas ?? []).filter((v) => !(v as { cerrada_at?: string | null }).cerrada_at && !(v as { cancelada_at?: string | null }).cancelada_at).length;
  return (
    <div className="space-y-4">
      <SeccionPanel titulo="Mis visitas a la planta">
        <p className="mb-3 text-xs text-muted-foreground">
          Se anuncian desde la ficha del cliente («Viene a la planta»). Central avisa a vigilancia y marca «Llegó»; el almacén
          prepara la máquina; usted la recibe y, al terminar, la registra con su resultado: eso es la gestión.
          {sinCerrar > 0 && <span className="ml-1 font-semibold text-amber-700">{sinCerrar} visita{sinCerrar === 1 ? "" : "s"} pasada{sinCerrar === 1 ? "" : "s"} sin registrar.</span>}
        </p>
        <ListaVisitasPlanta visitas={(proximas ?? []).map(mapear)} hoy={hoy} modo="comercial" />
      </SeccionPanel>
      {(pasadas ?? []).length > 0 && (
        <SeccionPanel titulo="Visitas anteriores">
          <ListaVisitasPlanta visitas={(pasadas ?? []).map(mapear)} hoy={hoy} pasadas modo="comercial" />
        </SeccionPanel>
      )}
    </div>
  );
}
