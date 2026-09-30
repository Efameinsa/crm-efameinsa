import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { CampoMeta } from "@/components/crm/campo-meta";
import { cargarMetasIndicadores } from "@/lib/indicadores-comerciales";
import { fechaHoraLima } from "@/lib/fechas";

export const dynamic = "force-dynamic";

/**
 * LAS METAS, EN UN SOLO LUGAR (0353, 30-09).
 *
 * El ing. Carlos pidió medir visitas y videollamadas «de cara a gerencia
 * comercial… son determinantes, entonces van a gestionar optimizando en eso»,
 * y separar el WhatsApp de campaña de la gestión. Cada indicador tiene su
 * meta, y las metas cambian: por eso viven en la base y se editan acá, sin
 * desplegar. Solo gerencia y admin (la función `guardar_meta` lo comprueba) y
 * cada cambio queda anotado con quién lo hizo, abajo.
 */

const ETIQUETA_CLAVE: Record<string, string> = {
  meta_visitas_semana: "Visitas por semana",
  meta_videollamadas_semana: "Videollamadas por semana",
  meta_wa_tipificados_pct: "WhatsApp: % calificados el mismo día",
  meta_wa_respuesta_min: "WhatsApp: minutos para responder",
  metas_visitas_desde: "Visitas y videollamadas se juzgan desde",
  meta_seguimientos_diarios: "Gestiones al día (quien no tenga la suya)",
  meta_gestiones_diarias: "Gestiones al día",
};

interface Cambio {
  clave: string;
  comercial_id: string | null;
  valor_anterior: number | null;
  valor_nuevo: number | null;
  cambiado_por: string;
  cambiado_at: string;
}

export default async function MetasPage() {
  await requerirRol(["gerencia", "admin"]);
  const supabase = await createClient();
  const [metas, { data: global }, { data: comercialesData }, historial] = await Promise.all([
    cargarMetasIndicadores(supabase),
    supabase.from("parametros").select("valor").eq("clave", "meta_seguimientos_diarios").maybeSingle(),
    supabase
      .from("perfiles")
      .select("id, nombre, codigo_comercial, meta_gestiones_diarias")
      .eq("rol", "comercial")
      .eq("activo", true)
      .eq("es_prueba", false)
      .eq("es_postventa", false)
      .eq("es_soporte", false)
      .order("codigo_comercial"),
    supabase.from("metas_historial").select("clave, comercial_id, valor_anterior, valor_nuevo, cambiado_por, cambiado_at").order("cambiado_at", { ascending: false }).limit(20),
  ]);
  const comerciales = (comercialesData ?? []) as { id: string; nombre: string; codigo_comercial: string | null; meta_gestiones_diarias: number | null }[];
  const metaGlobal = Number(global?.valor) || 30;
  const cambios = (historial.data ?? []) as Cambio[];
  const idsGente = [...new Set(cambios.flatMap((c) => [c.cambiado_por, c.comercial_id].filter((x): x is string => !!x)))];
  const { data: genteData } = idsGente.length ? await supabase.from("perfiles").select("id, nombre, codigo_comercial").in("id", idsGente) : { data: [] };
  const nombre = new Map(((genteData ?? []) as { id: string; nombre: string; codigo_comercial: string | null }[]).map((p) => [p.id, p.codigo_comercial ? `${p.codigo_comercial} · ${p.nombre}` : p.nombre]));
  const valorLegible = (clave: string, v: number | null) => {
    if (v === null || v === undefined) return "—";
    if (clave === "metas_visitas_desde") {
      const s = String(Math.trunc(Number(v)));
      return `${s.slice(6, 8)}-${s.slice(4, 6)}-${s.slice(0, 4)}`;
    }
    return String(Number(v));
  };

  const fila = (etiqueta: string, ayuda: string, campo: React.ReactNode) => (
    <li key={etiqueta} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{etiqueta}</p>
        <p className="text-[11px] text-muted-foreground">{ayuda}</p>
      </div>
      {campo}
    </li>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Metas</h1>
        <p className="text-sm text-muted-foreground">
          Lo que cada indicador espera de un comercial. Se guarda con Enter o con el visto; cada cambio queda anotado con quién lo hizo.
        </p>
      </div>

      <SeccionPanel titulo="Visitas, videollamadas y WhatsApp de campaña">
        <ul className="divide-y divide-border">
          {fila(
            "Visitas por semana",
            "Al cliente (gestión «Visita») o del cliente a la planta (visita a planta cerrada, o «Showroom»).",
            <CampoMeta clave="meta_visitas_semana" valor={metas.visitasSemana} sufijo="por semana" min={0} max={50} etiqueta="Visitas por semana" />,
          )}
          {fila(
            "Videollamadas por semana",
            "Gestión «Videollamada» con contacto real.",
            <CampoMeta
              clave="meta_videollamadas_semana"
              valor={metas.videollamadasSemana}
              sufijo="por semana"
              min={0}
              max={50}
              etiqueta="Videollamadas por semana"
            />,
          )}
          {fila(
            "Desde cuándo se juzgan con color",
            "Antes de esta fecha visitas y videollamadas se miden, pero su estado dice «En medición» en vez de ámbar o rojo.",
            <CampoMeta clave="metas_visitas_desde" valor={metas.visitasDesde} tipo="fecha" etiqueta="Fecha de arranque" />,
          )}
          {fila(
            "WhatsApp de campaña: calificados el mismo día",
            "De los chats que llegan por un anuncio, cuántos se marcan (interesado, cotizado, no contesta…) ese mismo día.",
            <CampoMeta clave="meta_wa_tipificados_pct" valor={metas.waCalificadosPct} sufijo="%" min={1} max={100} etiqueta="Porcentaje calificado" />,
          )}
          {fila(
            "WhatsApp de campaña: tiempo de respuesta",
            "Mediana hasta la primera respuesta de una persona, en minutos de oficina (L-V 08:30-18:00, S 08:30-13:00). El acuse automático no cuenta.",
            <CampoMeta clave="meta_wa_respuesta_min" valor={metas.waRespuestaMin} sufijo="min" min={1} max={600} etiqueta="Minutos para responder" />,
          )}
        </ul>
      </SeccionPanel>

      <SeccionPanel titulo="Gestiones efectivas al día (sin WhatsApp de campaña)">
        {comerciales.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay comerciales activos.</p>
        ) : (
          <ul className="divide-y divide-border">
            {comerciales.map((c) =>
              fila(
                `${c.codigo_comercial ? `${c.codigo_comercial} · ` : ""}${c.nombre}`,
                c.meta_gestiones_diarias ? "Su meta propia." : `Sin meta propia: usa la del equipo (${metaGlobal}).`,
                <CampoMeta
                  clave="meta_gestiones_diarias"
                  comercialId={c.id}
                  valor={c.meta_gestiones_diarias ?? metaGlobal}
                  sufijo="al día"
                  min={1}
                  max={200}
                  etiqueta={`Meta de gestiones de ${c.nombre.split(" ")[0]}`}
                />,
              ),
            )}
            {fila(
              "Para quien no tenga meta propia",
              "La meta del equipo.",
              <CampoMeta clave="meta_seguimientos_diarios" valor={metaGlobal} sufijo="al día" min={1} max={200} etiqueta="Meta del equipo" />,
            )}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Desde el 30-09 las marcas de un botón en los chats de WhatsApp de campaña ya no suman a esta meta: tienen su propio indicador, arriba.
        </p>
      </SeccionPanel>

      <SeccionPanel titulo="Últimos cambios">
        {historial.error ? (
          <p className="text-sm text-muted-foreground">El registro de cambios aparece cuando se aplique la migración 0353 en la base.</p>
        ) : cambios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nadie cambió una meta desde esta pantalla todavía.</p>
        ) : (
          <ul className="divide-y divide-border text-xs">
            {cambios.map((c, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
                <span className="text-foreground">
                  <b className="font-semibold">{ETIQUETA_CLAVE[c.clave] ?? c.clave}</b>
                  {c.comercial_id ? ` de ${nombre.get(c.comercial_id) ?? "un comercial"}` : ""}: {valorLegible(c.clave, c.valor_anterior)} →{" "}
                  <b className="tabular-nums">{valorLegible(c.clave, c.valor_nuevo)}</b>
                </span>
                <span className="text-muted-foreground">
                  {nombre.get(c.cambiado_por) ?? "—"} · {fechaHoraLima(c.cambiado_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SeccionPanel>
    </div>
  );
}
