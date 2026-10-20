import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { duracionLegible, fechaLima, numeroParaMostrar } from "@/lib/llamadas";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { FilaLlamada, type LlamadaVista } from "@/components/crm/fila-llamada";

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
