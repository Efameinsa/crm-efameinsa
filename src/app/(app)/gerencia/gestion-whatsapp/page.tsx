import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/auth";
import { hoyLima } from "@/lib/periodo";
import { PREFIJO_MARCA_WHATSAPP, WHATSAPP_CUENTA_PARA_META } from "@/lib/gestion-whatsapp";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { PildoraEstado, lineaWhatsapp } from "@/components/crm/indicadores-comerciales";
import { cargarMetasIndicadores, cargarWhatsappCampania, evaluarWhatsapp } from "@/lib/indicadores-comerciales";

export const dynamic = "force-dynamic";

// Las marcas, en el orden en que se leen: de la mejor noticia a la peor. El
// texto es el que deja whatsapp-campanas.ts en la nota («Por WhatsApp: …»).
const MARCAS: { clave: string; etiqueta: string; texto: string; color: string }[] = [
  { clave: "cotizado", etiqueta: "Cotizado", texto: "se le envió cotización", color: "#1E7F4F" },
  { clave: "interesado", etiqueta: "Interesado", texto: "el cliente está interesado", color: "#25A366" },
  { clave: "linea", etiqueta: "Sigue por su línea", texto: "la conversación sigue por la línea", color: "#4A6670" },
  { clave: "sin_respuesta", etiqueta: "No contesta", texto: "no contesta|sin respuesta", color: "#B7791F" },
  { clave: "no_interesado", etiqueta: "No interesado", texto: "no está interesado", color: "#8B1510" },
  { clave: "equivocado", etiqueta: "Número equivocado", texto: "número equivocado", color: "#6B6B6B" },
];
const DIAS = 7;

/**
 * GESTIÓN DE WHATSAPP (Santos, 23-09): «crear una aparte que sea gestión de
 * WhatsApp… porque aún no tenemos bien definidos sus KPIs». Esta pantalla es
 * la materia prima para definirlos: cuántas marcas hizo cada quien en los
 * últimos siete días y de qué tipo, día por día. No juzga contra ninguna
 * meta a propósito: todavía no hay una.
 */
export default async function GestionWhatsappPage() {
  await requerirRol(["gerencia", "admin"]);
  const supabase = await createClient();
  const hoy = hoyLima();
  const desde = new Date(new Date(`${hoy}T00:00:00-05:00`).getTime() - (DIAS - 1) * 86_400_000);
  const dias = Array.from({ length: DIAS }, (_, i) => new Date(desde.getTime() + i * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Lima" }));

  // De a mil, que es el tope de cada respuesta.
  const filas: { realizada_por: string; nota: string; realizada_at: string }[] = [];
  for (let desdeFila = 0; desdeFila < 20_000; desdeFila += 1000) {
    const { data } = await supabase
      .from("actividades")
      .select("realizada_por, nota, realizada_at")
      .eq("tipo", "whatsapp")
      .ilike("nota", `${PREFIJO_MARCA_WHATSAPP}%`)
      .gte("realizada_at", desde.toISOString())
      .order("realizada_at")
      .range(desdeFila, desdeFila + 999);
    filas.push(...((data ?? []) as typeof filas));
    if ((data ?? []).length < 1000) break;
  }
  const ids = [...new Set(filas.map((f) => f.realizada_por))];
  const { data: gente } = ids.length ? await supabase.from("perfiles").select("id, nombre, codigo_comercial").in("id", ids) : { data: [] };
  const nombre = new Map(((gente ?? []) as { id: string; nombre: string; codigo_comercial: string | null }[]).map((g) => [g.id, `${g.codigo_comercial ? `${g.codigo_comercial} · ` : ""}${g.nombre}`]));

  const marcaDe = (nota: string) => {
    const t = nota.toLowerCase();
    // «sin respuesta del cliente» es el texto de antes del 23-09 para «no contesta».
    return MARCAS.find((m) => m.texto.split("|").some((x) => t.includes(x)))?.clave ?? "otra";
  };
  type Fila = { id: string; total: number; porMarca: Record<string, number>; porDia: Record<string, number> };
  const porPersona = new Map<string, Fila>();
  for (const f of filas) {
    const p = porPersona.get(f.realizada_por) ?? { id: f.realizada_por, total: 0, porMarca: {}, porDia: {} };
    const m = marcaDe(f.nota);
    const d = new Date(f.realizada_at).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    p.total++;
    p.porMarca[m] = (p.porMarca[m] ?? 0) + 1;
    p.porDia[d] = (p.porDia[d] ?? 0) + 1;
    porPersona.set(f.realizada_por, p);
  }
  const personas = [...porPersona.values()].sort((a, b) => b.total - a.total);

  // EL INDICADOR (30-09): lo que esta pantalla vino a preparar. Chats de
  // anuncio de los mismos siete días, por comercial, contra las metas.
  const { data: comercialesData } = await supabase
    .from("perfiles")
    .select("id, nombre, codigo_comercial")
    .eq("rol", "comercial")
    .eq("activo", true)
    .eq("es_prueba", false)
    .eq("es_postventa", false)
    .order("codigo_comercial");
  const comerciales = (comercialesData ?? []) as { id: string; nombre: string; codigo_comercial: string | null }[];
  const [metas, campania] = await Promise.all([
    cargarMetasIndicadores(supabase),
    cargarWhatsappCampania(supabase, comerciales.map((c) => c.id), dias[0], hoy),
  ]);
  const conChats = comerciales.filter((c) => (campania.get(c.id)?.chats ?? 0) > 0);
  const maxDia = Math.max(1, ...personas.flatMap((p) => Object.values(p.porDia)));
  const diaCorto = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, dd, 12)).toLocaleDateString("es-PE", { timeZone: "UTC", weekday: "short", day: "numeric" });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Gestión de WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Las marcas que cada quien pone en los chats (interesado, cotizado, no contesta…), los últimos {DIAS} días.{" "}
          {WHATSAPP_CUENTA_PARA_META
            ? "Por ahora se siguen sumando a los seguimientos de la meta diaria; en supervisión y en el reporte diario van en su propia barra."
            : "Desde el 30-09 no suman a la meta de gestiones: el WhatsApp de campaña se mide con su propio indicador."}
        </p>
      </div>

      <SeccionPanel titulo={`WhatsApp de campaña · últimos ${DIAS} días`}>
        {conChats.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún comercial recibió chats de anuncio en estos días: no hay nada que medir.</p>
        ) : (
          <ul className="divide-y divide-border">
            {conChats.map((c) => {
              const w = campania.get(c.id)!;
              const estado = evaluarWhatsapp(w, metas, false);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-xs">
                  <b className="font-semibold text-foreground">
                    {c.codigo_comercial ? `${c.codigo_comercial} · ` : ""}
                    {c.nombre}
                  </b>
                  <span className="tabular-nums text-muted-foreground">
                    {w.chats} chat{w.chats === 1 ? "" : "s"} · {lineaWhatsapp(w)}
                    {w.fueraDeHorario > 0 ? ` · ${w.fueraDeHorario} fuera de horario` : ""}
                  </span>
                  {estado && <PildoraEstado evaluacion={estado} />}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Metas: {metas.waCalificadosPct} % de los chats calificados el mismo día en que llegan, y la primera respuesta de una persona en{" "}
          {metas.waRespuestaMin} min o menos (mediana, contando solo los chats que llegaron en horario de oficina: L-V 08:30-18:00, S 08:30-13:00; el
          acuse automático no cuenta).
        </p>
      </SeccionPanel>

      <div className="flex flex-wrap gap-2 text-[11px]">
        {MARCAS.map((m) => (
          <span key={m.clave} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: m.color }} /> {m.etiqueta}
          </span>
        ))}
      </div>

      {personas.length === 0 ? (
        <SeccionPanel titulo="Sin marcas">
          <p className="text-sm text-muted-foreground">Nadie marcó chats de WhatsApp en los últimos {DIAS} días.</p>
        </SeccionPanel>
      ) : (
        personas.map((p) => (
          <SeccionPanel key={p.id} titulo={`${nombre.get(p.id) ?? "Sin nombre"} · ${p.total} marcas`}>
            {/* La barra por tipo de marca: cómo le va, no cuánto hizo. */}
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
              {MARCAS.map((m) =>
                p.porMarca[m.clave] ? (
                  <div
                    key={m.clave}
                    title={`${m.etiqueta}: ${p.porMarca[m.clave]}`}
                    style={{ width: `${(p.porMarca[m.clave] / p.total) * 100}%`, backgroundColor: m.color }}
                  />
                ) : null,
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {MARCAS.filter((m) => p.porMarca[m.clave]).map((m) => (
                <span key={m.clave}>
                  {m.etiqueta}: <b className="text-foreground">{p.porMarca[m.clave]}</b> ({Math.round((p.porMarca[m.clave] / p.total) * 100)} %)
                </span>
              ))}
            </div>
            {/* Día por día: el ritmo. */}
            <div className="mt-3 grid grid-cols-7 items-end gap-1.5">
              {dias.map((d) => {
                const n = p.porDia[d] ?? 0;
                return (
                  <div key={d} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] tabular-nums text-foreground">{n || ""}</span>
                    <div className="w-full rounded-t bg-[#25A366]" style={{ height: `${Math.max(n ? 4 : 1, (n / maxDia) * 64)}px`, opacity: n ? 1 : 0.2 }} />
                    <span className="text-[10px] text-muted-foreground">{diaCorto(d)}</span>
                  </div>
                );
              })}
            </div>
          </SeccionPanel>
        ))
      )}
    </div>
  );
}
