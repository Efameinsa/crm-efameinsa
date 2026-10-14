import { Database, Sparkles } from "lucide-react";
import { requerirRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * LA AUDITORÍA DEL ASISTENTE (0479). Santos, 14-10: «sus historiales de
 * preguntas se deben de guardar para luego poder auditarlas en la vista de
 * admin».
 *
 * Una fila por pregunta: quién, con qué permisos preguntó ese día, qué le
 * respondió, con qué consultas al CRM lo armó, cuánto tardó y cuánto costó. Se
 * abre con un clic, sin JavaScript (<details>), igual que las secciones
 * plegables del resto del CRM.
 *
 * Para qué sirve, además de controlar: las respuestas «no lo tengo
 * documentado» y las que terminaron en error dicen qué falta escribir en la
 * guía del asistente o qué consulta hay que agregarle.
 */

const ESTADO: Record<string, { texto: string; clase: string }> = {
  ok: { texto: "respondió", clase: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  error: { texto: "error", clase: "bg-destructive/10 text-destructive" },
  rechazo: { texto: "no respondió", clase: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  corte: { texto: "cortada", clase: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
};

interface Fila {
  id: number;
  conversacion_id: string;
  usuario_id: string;
  rol: string;
  alcance: string | null;
  pregunta: string;
  respuesta: string | null;
  estado: string;
  error: string | null;
  consultas: { herramienta: string; resumen: string; ms: number }[] | null;
  tokens_entrada: number | null;
  tokens_salida: number | null;
  tokens_cache_lectura: number | null;
  costo_usd: number | null;
  ms_primer_texto: number | null;
  ms_total: number | null;
  created_at: string;
  perfiles: { nombre: string; codigo_comercial: string | null } | null;
}

const segundos = (ms: number | null) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`);
const dolares = (n: number) => `US$ ${n.toFixed(n < 1 ? 3 : 2)}`;

export default async function AuditoriaAsistentePage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string; dias?: string; estado?: string; q?: string }>;
}) {
  await requerirRol(["admin"]);
  const filtro = await searchParams;
  const dias = [1, 7, 30, 90].includes(Number(filtro.dias)) ? Number(filtro.dias) : 7;
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

  const supabase = await createClient();
  let consulta = supabase
    .from("asistente_mensajes")
    .select(
      "id, conversacion_id, usuario_id, rol, alcance, pregunta, respuesta, estado, error, consultas, tokens_entrada, tokens_salida, tokens_cache_lectura, costo_usd, ms_primer_texto, ms_total, created_at, perfiles(nombre, codigo_comercial)",
    )
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(300);
  if (filtro.persona) consulta = consulta.eq("usuario_id", filtro.persona);
  if (filtro.estado && ESTADO[filtro.estado]) consulta = consulta.eq("estado", filtro.estado);
  if (filtro.q?.trim()) {
    const q = `%${filtro.q.trim().replace(/[%,()]/g, " ")}%`;
    consulta = consulta.or(`pregunta.ilike.${q},respuesta.ilike.${q}`);
  }

  const [{ data, error }, { data: personas }] = await Promise.all([
    consulta,
    supabase.from("perfiles").select("id, nombre, codigo_comercial").eq("activo", true).order("nombre"),
  ]);
  const filas = (data ?? []) as unknown as Fila[];

  const costo = filas.reduce((s, f) => s + Number(f.costo_usd ?? 0), 0);
  const conPrimerTexto = filas.filter((f) => f.ms_primer_texto != null);
  const primerTextoMedio = conPrimerTexto.length
    ? conPrimerTexto.reduce((s, f) => s + (f.ms_primer_texto ?? 0), 0) / conPrimerTexto.length
    : null;
  const totalMedio = filas.length ? filas.reduce((s, f) => s + (f.ms_total ?? 0), 0) / filas.length : null;
  const fallas = filas.filter((f) => f.estado !== "ok").length;
  const quienes = new Set(filas.map((f) => f.usuario_id)).size;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Auditoría del asistente</h1>
          <p className="text-xs text-muted-foreground">
            Cada pregunta que el personal le hizo al asistente, con lo que respondió y de dónde lo sacó.
          </p>
        </div>
      </div>

      {/* Filtros: un formulario GET, sin JavaScript. */}
      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3 text-xs shadow-sm">
        <label className="grid gap-1">
          <span className="text-muted-foreground">Persona</span>
          <select name="persona" defaultValue={filtro.persona ?? ""} className="h-8 rounded-md border border-input bg-background px-2">
            <option value="">Todas</option>
            {(personas ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo_comercial ? `${p.codigo_comercial} · ` : ""}
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-muted-foreground">Período</span>
          <select name="dias" defaultValue={String(dias)} className="h-8 rounded-md border border-input bg-background px-2">
            <option value="1">Últimas 24 horas</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-muted-foreground">Resultado</span>
          <select name="estado" defaultValue={filtro.estado ?? ""} className="h-8 rounded-md border border-input bg-background px-2">
            <option value="">Todos</option>
            {Object.entries(ESTADO).map(([k, v]) => (
              <option key={k} value={k}>
                {v.texto}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-48 flex-1 gap-1">
          <span className="text-muted-foreground">Texto en la pregunta o la respuesta</span>
          <input name="q" defaultValue={filtro.q ?? ""} className="h-8 rounded-md border border-input bg-background px-2" />
        </label>
        <button type="submit" className="h-8 rounded-md bg-primary px-3 font-medium text-primary-foreground hover:bg-primary/90">
          Filtrar
        </button>
      </form>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { t: "Preguntas", v: String(filas.length) + (filas.length === 300 ? "+" : "") },
          { t: "Personas", v: String(quienes) },
          { t: "Empieza a responder", v: segundos(primerTextoMedio) },
          { t: "Respuesta completa", v: segundos(totalMedio) },
          { t: "Costo del período", v: dolares(costo) },
        ].map((k) => (
          <div key={k.t} className="rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
            <p className="text-[11px] text-muted-foreground">{k.t}</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">{k.v}</p>
          </div>
        ))}
      </div>
      {fallas > 0 && (
        <p className="text-xs text-muted-foreground">
          {fallas} pregunta{fallas === 1 ? "" : "s"} sin respuesta completa en el período (error, cortada o no respondida).
        </p>
      )}

      <SeccionPanel titulo="Preguntas">
        {error ? (
          <p className="text-sm text-destructive">No se pudo leer el historial: {error.message}</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nadie le preguntó nada al asistente con estos filtros. Pruebe con un período más largo o con «Todas» las personas.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filas.map((f) => {
              const e = ESTADO[f.estado] ?? ESTADO.error;
              return (
                <li key={f.id}>
                  <details className="group py-2.5">
                    <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
                      <span className="mt-0.5 text-muted-foreground transition-transform group-open:rotate-90">▸</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{f.pregunta}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {f.perfiles?.codigo_comercial ? `${f.perfiles.codigo_comercial} · ` : ""}
                          {f.perfiles?.nombre ?? "—"} · {f.alcance ?? f.rol} · {fechaHoraLima(f.created_at)} · {segundos(f.ms_total)}
                          {f.consultas?.length ? ` · ${f.consultas.length} consulta${f.consultas.length === 1 ? "" : "s"}` : ""}
                        </p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", e.clase)}>{e.texto}</span>
                    </summary>
                    <div className="ml-6 mt-2 space-y-2 text-[13px]">
                      <div className="rounded-lg border border-border/70 bg-secondary/30 p-3">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Respuesta</p>
                        <p className="whitespace-pre-line text-foreground">{f.respuesta ?? "—"}</p>
                        {f.error && <p className="mt-2 font-mono text-[11px] text-destructive">{f.error}</p>}
                      </div>
                      {f.consultas && f.consultas.length > 0 && (
                        <div className="rounded-lg border border-border/70 p-3">
                          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <Database className="size-3" /> Lo que consultó en el CRM
                          </p>
                          <ul className="space-y-0.5 text-[12px]">
                            {f.consultas.map((c, i) => (
                              <li key={i}>
                                <span className="font-mono text-primary">{c.herramienta}</span>{" "}
                                <span className="text-muted-foreground">· {c.resumen} · {segundos(c.ms)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Empezó a responder a los {segundos(f.ms_primer_texto)} · tokens: {f.tokens_entrada ?? 0} de entrada,{" "}
                        {f.tokens_cache_lectura ?? 0} del caché, {f.tokens_salida ?? 0} de salida · {dolares(Number(f.costo_usd ?? 0))} ·{" "}
                        <a href={`?persona=${f.usuario_id}&dias=${dias}`} className="underline hover:text-foreground">
                          ver todo lo de esta persona
                        </a>
                      </p>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </SeccionPanel>
    </div>
  );
}
