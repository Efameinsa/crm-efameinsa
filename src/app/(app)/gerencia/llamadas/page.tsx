import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { duracionLegible, fechaLima, numeroParaMostrar } from "@/lib/llamadas";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { FilaLlamada, type LlamadaVista } from "@/components/crm/fila-llamada";
import { RESULTADOS, type Resultado } from "@/lib/setter-tipificacion";

export const dynamic = "force-dynamic";

const TOPE = 500;

type Fila = {
  id: string;
  user_id: string;
  cuenta_id: string | null;
  numero: string;
  iniciada_at: string;
  duracion_s: number;
  contestada: boolean;
  origen: string;
  estado_audio: string;
  estado_ia: string;
  resumen: string | null;
  ia: { proxima_accion?: string | null; compromisos?: string[]; tono?: string | null } | null;
  cuentas: { razon_social: string | null; nombre_comercial: string | null } | null;
  contactos: { nombre: string } | null;
};

type FilaSetter = {
  id: string;
  nombre: string;
  telefono: string;
  resultado: Resultado;
  nota: string | null;
  duracion_s: number | null;
  tipificada_at: string;
  intento: number;
  leads: { codigo: string | null; codigo_campania_wa: string | null } | null;
};

const COLOR_SETTER = { pasa: "bg-emerald-100 text-emerald-900", cierra: "bg-rose-100 text-rose-900", reintento: "bg-amber-100 text-amber-900" } as const;

/**
 * LLAMADAS GRABADAS (Santos, 19-10-2026): todas las llamadas que los comerciales
 * hicieron con el botón «Llamar», por día, con su audio, su transcripción y el
 * resumen. Arriba, una tarjeta por comercial: cuántas llamó, cuántas contestaron,
 * cuántos minutos hablaron y de cuántas hay audio. Gerencia y admin ven todas
 * (lo decide la RLS de la tabla, no esta página).
 */
export default async function LlamadasGerenciaPage({ searchParams }: { searchParams: Promise<{ dia?: string; comercial?: string; q?: string }> }) {
  const sp = await searchParams;
  const hoy = hoyLima();
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? "") ? (sp.dia as string) : hoy;
  const comercialFiltro = /^[0-9a-f-]{36}$/i.test(sp.comercial ?? "") ? (sp.comercial as string) : "";
  const q = (sp.q ?? "").trim().toLowerCase();

  const supabase = await createClient();
  const desde = new Date(`${dia}T00:00:00-05:00`);
  const hasta = new Date(desde.getTime() + 86_400_000);

  let consulta = supabase
    .from("llamadas")
    .select(
      "id, user_id, cuenta_id, numero, iniciada_at, duracion_s, contestada, origen, estado_audio, estado_ia, resumen, ia, cuentas(razon_social, nombre_comercial), contactos(nombre)",
    )
    .gte("iniciada_at", desde.toISOString())
    .lt("iniciada_at", hasta.toISOString())
    .order("iniciada_at", { ascending: false })
    .limit(TOPE);
  if (comercialFiltro) consulta = consulta.eq("user_id", comercialFiltro);
  const { data } = await consulta;
  const filas = (data ?? []) as unknown as Fila[];

  // El setter (20-10): cada lead de Meta que llamó y cómo lo tipificó. Sale de aquí el informe por campaña.
  const { data: dataSetter } = await supabase
    .from("llamadas_por_hacer")
    .select("id, nombre, telefono, resultado, nota, duracion_s, tipificada_at, intento, leads(codigo, codigo_campania_wa)")
    .not("resultado", "is", null)
    .gte("tipificada_at", desde.toISOString())
    .lt("tipificada_at", hasta.toISOString())
    .order("tipificada_at", { ascending: false })
    .limit(TOPE);
  const delSetter = ((dataSetter ?? []) as unknown as FilaSetter[]).filter((f) => f.resultado in RESULTADOS);
  const conteoSetter = new Map<Resultado, number>();
  for (const f of delSetter) conteoSetter.set(f.resultado, (conteoSetter.get(f.resultado) ?? 0) + 1);
  const pasaron = delSetter.filter((f) => RESULTADOS[f.resultado].tipo === "pasa").length;
  const porCampania = new Map<string, { total: number; pasan: number }>();
  for (const f of delSetter) {
    const c = f.leads?.codigo_campania_wa ?? "Sin campaña";
    const t = porCampania.get(c) ?? { total: 0, pasan: 0 };
    t.total++;
    if (RESULTADOS[f.resultado].tipo === "pasa") t.pasan++;
    porCampania.set(c, t);
  }

  const { data: gente } = await supabase
    .from("perfiles")
    .select("id, nombre, codigo_comercial")
    .eq("rol", "comercial")
    .eq("activo", true)
    .eq("es_prueba", false)
    .order("codigo_comercial");
  const comerciales = (gente ?? []) as { id: string; nombre: string; codigo_comercial: string | null }[];
  const etiqueta = new Map(comerciales.map((c) => [c.id, `${c.codigo_comercial ? `${c.codigo_comercial} · ` : ""}${c.nombre}`]));
  const quien = (id: string) => etiqueta.get(id) ?? "—";

  const visibles = filas.filter((f) => {
    if (!q) return true;
    const cliente = `${f.cuentas?.razon_social ?? ""} ${f.cuentas?.nombre_comercial ?? ""} ${f.contactos?.nombre ?? ""}`;
    return `${cliente} ${f.numero} ${f.resumen ?? ""}`.toLowerCase().includes(q);
  });

  // Una tarjeta por comercial (con las llamadas ya filtradas por el buscador).
  const tarjetas = new Map<string, { llamadas: number; contestadas: number; segundos: number; conAudio: number; esperanAudio: number }>();
  for (const f of visibles) {
    const t = tarjetas.get(f.user_id) ?? { llamadas: 0, contestadas: 0, segundos: 0, conAudio: 0, esperanAudio: 0 };
    t.llamadas++;
    if (f.contestada) {
      t.contestadas++;
      t.segundos += f.duracion_s;
      if (f.origen === "app" && f.estado_audio !== "no_disponible") {
        t.esperanAudio++;
        if (f.estado_audio === "subido") t.conAudio++;
      }
    }
    tarjetas.set(f.user_id, t);
  }
  const tarjetasOrdenadas = [...tarjetas.entries()].sort((a, b) => b[1].llamadas - a[1].llamadas);

  const vista: LlamadaVista[] = visibles.map((f) => ({
    id: f.id,
    hora: fechaLima(f.iniciada_at).horaPantalla,
    comercial: quien(f.user_id),
    cuentaId: f.cuenta_id,
    cliente: f.cuentas?.razon_social || f.cuentas?.nombre_comercial || null,
    contacto: f.contactos?.nombre ?? null,
    numero: numeroParaMostrar(f.numero),
    duracion: f.contestada ? duracionLegible(f.duracion_s) : "no contestó",
    contestada: f.contestada,
    origen: f.origen,
    estadoAudio: f.estado_audio,
    estadoIa: f.estado_ia,
    resumen: f.resumen,
    proximaAccion: f.ia?.proxima_accion ?? null,
    tono: f.ia?.tono ?? null,
  }));

  const diaAnterior = new Date(desde.getTime() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const diaSiguiente = new Date(desde.getTime() + 86_400_000 + 3_600_000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const enlace = (d: string) => `?dia=${d}${comercialFiltro ? `&comercial=${comercialFiltro}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Llamadas grabadas</h1>
        <p className="text-sm text-muted-foreground">
          Lo que cada comercial llamó con el botón «Llamar» del CRM: quién, a quién, cuánto habló y, si hay audio, su transcripción y un resumen.
          Los archivos están en el servidor de la oficina, por día y por cliente.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3 text-sm shadow-sm">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-muted-foreground">
          Día
          <input type="date" name="dia" defaultValue={dia} max={hoy} className="h-9 rounded-md border border-border bg-background px-2 text-sm font-normal normal-case text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-muted-foreground">
          Comercial
          <select name="comercial" defaultValue={comercialFiltro} className="h-9 rounded-md border border-border bg-background px-2 text-sm font-normal normal-case text-foreground">
            <option value="">Todos</option>
            {comerciales.map((c) => (
              <option key={c.id} value={c.id}>
                {quien(c.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-[11px] font-semibold uppercase text-muted-foreground">
          Cliente, número o algo que se dijo
          <input type="search" name="q" defaultValue={q} placeholder="Buscar…" className="h-9 rounded-md border border-border bg-background px-2 text-sm font-normal normal-case text-foreground" />
        </label>
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
          Ver
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <Link href={enlace(diaAnterior)} className="text-primary hover:underline">
            ← Día anterior
          </Link>
          {dia < hoy && (
            <Link href={enlace(diaSiguiente)} className="text-primary hover:underline">
              Día siguiente →
            </Link>
          )}
          <a href={`/api/llamadas/exportar?dia=${dia}${comercialFiltro ? `&comercial=${comercialFiltro}` : ""}`} className="font-semibold text-primary hover:underline">
            Exportar a Excel
          </a>
        </div>
      </form>

      {delSetter.length > 0 && (
        <SeccionPanel titulo={`Setter · leads de Meta filtrados · ${delSetter.length}`}>
          <p className="mb-2 text-xs text-muted-foreground">
            Cada lead que el setter llamó y cómo lo tipificó. «Pasa» = se repartió al vendedor; «cierra» = se cerró con su motivo; «reintento» = volverá a llamarse.
            {` Pasaron al vendedor ${pasaron} de ${delSetter.length} (${Math.round((100 * pasaron) / delSetter.length)} %).`}
          </p>
          <ul className="mb-3 flex flex-wrap gap-2 text-xs">
            {(Object.keys(RESULTADOS) as Resultado[])
              .filter((k) => conteoSetter.has(k))
              .map((k) => (
                <li key={k} className={`rounded-full px-3 py-1 font-semibold tabular-nums ${COLOR_SETTER[RESULTADOS[k].tipo]}`}>
                  {RESULTADOS[k].etiqueta}: {conteoSetter.get(k)}
                </li>
              ))}
          </ul>
          <ul className="mb-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
            {[...porCampania.entries()].map(([c, t]) => (
              <li key={c} className="tabular-nums">
                <b className="text-foreground">{c}</b>: {t.total} lead{t.total === 1 ? "" : "s"}, {t.pasan} pasaron
              </li>
            ))}
          </ul>
          <ul className="divide-y divide-border text-sm">
            {delSetter.map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
                <span className="w-12 tabular-nums text-xs text-muted-foreground">{fechaLima(f.tipificada_at).horaPantalla}</span>
                <b className="font-semibold text-foreground">{f.nombre}</b>
                <span className="tabular-nums text-xs text-muted-foreground">{numeroParaMostrar(f.telefono)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${COLOR_SETTER[RESULTADOS[f.resultado].tipo]}`}>{RESULTADOS[f.resultado].etiqueta}</span>
                {f.leads?.codigo_campania_wa && <span className="text-xs text-muted-foreground">{f.leads.codigo_campania_wa}</span>}
                {f.intento > 1 && <span className="text-xs text-muted-foreground">intento {f.intento}</span>}
                {f.nota && <span className="basis-full text-xs text-muted-foreground">{f.nota}</span>}
              </li>
            ))}
          </ul>
        </SeccionPanel>
      )}

      <SeccionPanel titulo={`Por comercial · ${dia.split("-").reverse().join("-")}`}>
        {tarjetasOrdenadas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nadie llamó con el botón este día.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tarjetasOrdenadas.map(([id, t]) => (
              <li key={id} className="rounded-lg border border-border bg-background p-3 text-xs">
                <b className="text-sm font-semibold text-foreground">{quien(id)}</b>
                <p className="mt-1 tabular-nums text-muted-foreground">
                  {t.llamadas} llamada{t.llamadas === 1 ? "" : "s"} · {t.contestadas} contestada{t.contestadas === 1 ? "" : "s"} · {Math.round(t.segundos / 60)} min hablados
                </p>
                <p className="tabular-nums text-muted-foreground">
                  {t.esperanAudio === 0 ? "Sin audio esperado" : `Audio de ${t.conAudio} de ${t.esperanAudio} (${Math.round((100 * t.conAudio) / t.esperanAudio)} %)`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SeccionPanel>

      <SeccionPanel titulo={`Llamadas del día · ${vista.length}${filas.length >= TOPE ? ` (se muestran las últimas ${TOPE})` : ""}`}>
        {vista.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay llamadas con estos filtros.</p>
        ) : (
          <ul className="divide-y divide-border">
            {vista.map((l) => (
              <FilaLlamada key={l.id} l={l} />
            ))}
          </ul>
        )}
      </SeccionPanel>
    </div>
  );
}
