import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BusquedaEnVivo } from "@/components/crm/busqueda-en-vivo";
import { VisitaPlantaBoton } from "@/components/crm/visita-planta-boton";
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
export default async function VisitasPlantaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requerirRol(["central", "gerencia", "admin", "operaciones"]);
  const supabase = await createClient();
  const hoy = hoyLima();
  // BUSCAR EN EL HISTÓRICO (Central, 16-09): «así en algún futuro se llegase
  // a buscar esa visita que tal fecha hubo». Por empresa, persona, RUC, DNI o
  // fecha (2026-09-16, 16/09 o 16-09).
  const q = ((await searchParams).q ?? "").trim();
  const columnas = "id, empresa, ruc, persona, dni, telefono, motivo, fecha, hora, registrado_at, impreso_at, cancelada_at, cancelada_motivo, cuenta_id, showroom, prender_tv, infocorp, cotizacion_ref, acompanantes, equipo_a_ver, quitar_film, infocorp_enviado_at, showroom_listo_at, film_retirado_at, tv_listo_at, llego_at, no_vino_at, reembalado_at, notas_central, perfiles!visitas_planta_registrado_por_fkey(nombre, codigo_comercial)";
  // Los filtros como texto (eq / or), aplicados sobre cada consulta.
  const filtro = (): { col: "fecha"; valor: string } | { or: string } | null => {
    if (!q) return null;
    const fecha = q.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
    if (fecha) {
      const anio = fecha[3] ? (fecha[3].length === 2 ? `20${fecha[3]}` : fecha[3]) : hoy.slice(0, 4);
      return { col: "fecha", valor: `${anio}-${fecha[2].padStart(2, "0")}-${fecha[1].padStart(2, "0")}` };
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return { col: "fecha", valor: q };
    const patron = `%${q}%`;
    return { or: `empresa.ilike.${patron},persona.ilike.${patron},ruc.ilike.${patron},dni.ilike.${patron},motivo.ilike.${patron}` };
  };
  const f = filtro();
  let qProximas = supabase.from("visitas_planta").select(columnas).gte("fecha", hoy);
  let qPasadas = supabase.from("visitas_planta").select(columnas).lt("fecha", hoy);
  if (f && "or" in f) {
    qProximas = qProximas.or(f.or);
    qPasadas = qPasadas.or(f.or);
  } else if (f) {
    qProximas = qProximas.eq(f.col, f.valor);
    qPasadas = qPasadas.eq(f.col, f.valor);
  }

  const [{ data: proximas }, { data: pasadas }] = await Promise.all([
    qProximas
      .order("fecha")
      .order("hora", { nullsFirst: false })
      .limit(200),
    qPasadas
      .order("fecha", { ascending: false })
      .limit(q ? 300 : 60),
  ]);

  const mapear = (v: unknown): VisitaFila => {
    const x = v as Omit<VisitaFila, "registradoPor"> & { perfiles: { nombre: string; codigo_comercial: string | null } | null };
    return {
      id: x.id, empresa: x.empresa, ruc: x.ruc, persona: x.persona, dni: x.dni, telefono: x.telefono, motivo: x.motivo,
      fecha: x.fecha, hora: x.hora, registrado_at: x.registrado_at, impreso_at: x.impreso_at, cancelada_at: x.cancelada_at,
      cancelada_motivo: x.cancelada_motivo, cuenta_id: x.cuenta_id, showroom: x.showroom, prender_tv: x.prender_tv, infocorp: x.infocorp, cotizacion_ref: x.cotizacion_ref,
      acompanantes: x.acompanantes, equipo_a_ver: x.equipo_a_ver, quitar_film: x.quitar_film, infocorp_enviado_at: x.infocorp_enviado_at, showroom_listo_at: x.showroom_listo_at,
      film_retirado_at: x.film_retirado_at, tv_listo_at: x.tv_listo_at, llego_at: x.llego_at, no_vino_at: x.no_vino_at, reembalado_at: x.reembalado_at, notas_central: x.notas_central,
      registradoPor: x.perfiles ? `${x.perfiles.codigo_comercial ? x.perfiles.codigo_comercial + " · " : ""}${x.perfiles.nombre}` : "—",
    };
  };

  return (
    <div className="space-y-4">
      <SeccionPanel titulo="Visitas a la planta">
        <p className="mb-3 text-xs text-muted-foreground">
          Lo que registran comerciales y postventa cuando un cliente viene. Se imprime para vigilancia; queda marcado
          cuándo se imprimió y la visita sigue acá, en el histórico, para buscarla después.
        </p>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Los checks son el procedimiento de la inducción: vigilancia avisada, Infocorp devuelto, lavandería y film (los
            marca el almacén o Central), «Llegó» avisa al comercial que baje a recibir, y al final que vuelvan a embalar.
          </p>
          {/* La visita de improviso (capítulo 2): el que llega sin aviso también se registra. */}
          <VisitaPlantaBoton cuentaId={null} empresa="" ruc={null} />
        </div>
        <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
          <BusquedaEnVivo inicial={q} placeholder="Buscar por empresa, persona, RUC, DNI o fecha (16/09)" />
          {q && (
            <Link href="/central/visitas" className="text-xs text-primary hover:underline">
              Ver todas
            </Link>
          )}
        </form>
        <ListaVisitasPlanta visitas={(proximas ?? []).map(mapear)} hoy={hoy} modo="central" />
      </SeccionPanel>
      {(pasadas ?? []).length > 0 && (
        <SeccionPanel titulo={q ? `Visitas anteriores que coinciden con «${q}»` : "Visitas anteriores"}>
          <ListaVisitasPlanta visitas={(pasadas ?? []).map(mapear)} hoy={hoy} pasadas modo="central" />
        </SeccionPanel>
      )}
    </div>
  );
}
