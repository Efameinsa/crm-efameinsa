import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaHoraLima } from "@/lib/fechas";
import { haceCuanto } from "@/lib/accesos";
import { ETIQUETA_EVENTO, REGLAS, type TipoEvento } from "@/lib/seguridad-conducta";
import { cn } from "@/lib/utils";

/**
 * «CONDUCTA SOSPECHOSA» EN ACCESOS Y EQUIPOS (0373).
 *
 * Santos (02-10-2026): «queremos estar enterados si hace screenshots, o tiene
 * algún comportamiento sospechoso como copiar información y llevársela a otro
 * lado… tenemos información muy delicada de la empresa». Esta sección lo
 * muestra: las alertas que ya se avisaron por la campana, un resumen por
 * persona de los últimos 7 días y los últimos eventos.
 *
 * SOLO MIRA. No bloquea nada (Santos: «no quiero que bloquees nada»). Y se
 * dice acá mismo lo que NO se puede ver, para que nadie crea que esto es una
 * garantía: una foto a la pantalla con otro celular, o lo que se hace después
 * de compartir un archivo fuera del CRM.
 */

const DIAS = 7;
const SALIDAS: TipoEvento[] = ["exportacion", "descarga", "impresion", "compartir"];

interface Evento {
  user_id: string;
  tipo: TipoEvento;
  origen: "app" | "web";
  detalle: Record<string, unknown> | null;
  creado_at: string;
}
interface Alerta {
  id: string;
  user_id: string;
  regla: string;
  resumen: string;
  creada_at: string;
}

/** Una fecha de hace tantos días, fuera del componente: pedir la hora no es algo puro. */
function haceDias(dias: number): string {
  return new Date(Date.now() - dias * 24 * 3_600_000).toISOString();
}

function detalleCorto(e: Evento): string {
  const d = e.detalle ?? {};
  const partes: string[] = [];
  if (e.tipo === "copiar" && typeof d.caracteres === "number") partes.push(`${d.caracteres} caracteres`);
  if (typeof d.nombre === "string") partes.push(d.nombre);
  if (typeof d.metodo === "string") partes.push(d.metodo === "tecla" ? "tecla Impr Pant" : d.metodo === "grabacion" ? "grabación de pantalla" : "captura");
  if (typeof d.ruta === "string") partes.push(d.ruta);
  return partes.join(" · ");
}

export async function SeccionSeguridad() {
  const supabase = await createClient();
  const desde = haceDias(DIAS);
  const [{ data: eventosData }, { data: alertasData }, { data: perfiles }] = await Promise.all([
    supabase
      .from("eventos_seguridad")
      .select("user_id, tipo, origen, detalle, creado_at")
      .gte("creado_at", desde)
      .order("creado_at", { ascending: false })
      .limit(3000),
    supabase
      .from("alertas_seguridad")
      .select("id, user_id, regla, resumen, creada_at")
      .gte("creada_at", haceDias(30))
      .order("creada_at", { ascending: false })
      .limit(30),
    supabase.from("perfiles").select("id, nombre, es_prueba"),
  ]);

  const eventos = (eventosData ?? []) as unknown as Evento[];
  const alertas = (alertasData ?? []) as unknown as Alerta[];
  const nombre = new Map((perfiles ?? []).map((p) => [p.id as string, `${p.nombre as string}${p.es_prueba ? " (práctica)" : ""}`]));
  const quien = (id: string) => nombre.get(id) ?? "Cuenta desconocida";

  const porPersona = new Map<string, { capturas: number; copias: number; copiasGrandes: number; salidas: number; ultimo: string }>();
  for (const e of eventos) {
    const f = porPersona.get(e.user_id) ?? { capturas: 0, copias: 0, copiasGrandes: 0, salidas: 0, ultimo: e.creado_at };
    if (e.tipo === "captura_pantalla") f.capturas++;
    else if (e.tipo === "copiar") {
      f.copias++;
      if (Number(e.detalle?.caracteres ?? 0) >= 1500) f.copiasGrandes++;
    } else if (SALIDAS.includes(e.tipo)) f.salidas++;
    if (e.creado_at > f.ultimo) f.ultimo = e.creado_at;
    porPersona.set(e.user_id, f);
  }
  const filas = [...porPersona.entries()].sort((a, b) => b[1].capturas * 50 + b[1].salidas + b[1].copiasGrandes * 20 - (a[1].capturas * 50 + a[1].salidas + a[1].copiasGrandes * 20));

  return (
    <SeccionPanel id="seguridad" titulo="Conducta sospechosa">
      <p className="mb-3 max-w-prose text-xs text-muted-foreground">
        Qué hace cada cuenta con la información: capturas de pantalla (en la app de Android; en la web, la tecla Impr Pant),
        copiar texto (se anota <strong className="text-foreground">cuántos caracteres, nunca cuáles</strong>), documentos
        exportados, archivos descargados, impresiones y archivos compartidos a otras aplicaciones. Solo mira y avisa: no
        bloquea nada. Gerencia y administración no se vigilan. <strong className="text-foreground">Lo que no se puede ver:</strong>{" "}
        una foto a la pantalla con otro celular, ni lo que se haga con un archivo ya compartido fuera del CRM. Se avisa por la
        campana cuando: {REGLAS.map((r) => r.nombre.toLowerCase()).join("; ")}.
      </p>

      {alertas.length > 0 ? (
        <div className="mb-4">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-red-700 dark:text-red-400">
            <ShieldAlert className="size-3.5" /> Alertas de los últimos 30 días ({alertas.length})
          </h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {alertas.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                <span className="text-xs tabular-nums text-muted-foreground">{fechaHoraLima(a.creada_at)}</span>
                <span className="font-semibold">{quien(a.user_id)}</span>
                <span>{a.resumen}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mb-4 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
          Sin alertas en los últimos 30 días.
        </p>
      )}

      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Resumen por persona · últimos {DIAS} días</h3>
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay eventos registrados.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Persona</th>
                <th className="px-3 py-2 text-right font-semibold">Capturas</th>
                <th className="px-3 py-2 text-right font-semibold">Copias</th>
                <th className="px-3 py-2 text-right font-semibold">Documentos sacados</th>
                <th className="px-3 py-2 font-semibold">Último evento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map(([id, f]) => (
                <tr key={id}>
                  <td className="px-3 py-2 font-medium">{quien(id)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", f.capturas > 0 && "font-bold text-red-700 dark:text-red-400")}>{f.capturas}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {f.copias}
                    {f.copiasGrandes > 0 && <span className="ml-1 font-bold text-red-700 dark:text-red-400">({f.copiasGrandes} grandes)</span>}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", f.salidas >= 25 && "font-bold text-red-700 dark:text-red-400")}>{f.salidas}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{haceCuanto(f.ultimo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {eventos.length > 0 && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">Ver los últimos eventos</summary>
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {eventos.slice(0, 40).map((e, i) => (
              <li key={`${e.creado_at}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5 text-xs">
                <span className="tabular-nums text-muted-foreground">{fechaHoraLima(e.creado_at)}</span>
                <span className="font-semibold">{quien(e.user_id)}</span>
                <span>{ETIQUETA_EVENTO[e.tipo] ?? e.tipo}</span>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{e.origen === "app" ? "app" : "web"}</span>
                <span className="break-all text-muted-foreground">{detalleCorto(e)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </SeccionPanel>
  );
}
