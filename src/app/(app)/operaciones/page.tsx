import { redirect } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { CodigoAutorizacion } from "@/components/crm/codigo-autorizacion";
import { fechaHoraLima } from "@/lib/fechas";

export const dynamic = "force-dynamic";

/**
 * Autorizaciones: qué se autorizó, y el código para autorizar lo siguiente.
 *
 * ANTES ERA UN INSTRUCTIVO. La primera versión explicaba en tres párrafos
 * cuándo la iban a llamar y qué pasaba después — «¿son instrucciones?», con
 * razón. Un instructivo se lee una vez; esta pantalla se abre todos los días.
 *
 * Lo que se mira a diario es el HISTORIAL —qué se anuló, quién lo pidió y por
 * qué—, así que ocupa la pantalla. El código va al costado, con su reloj, que
 * es donde la mano lo busca cuando suena el teléfono. Lo demás cabe en un
 * renglón: no hace falta explicar el procedimiento a quien lo hace.
 */

interface FilaBitacora {
  informe_id: string;
  codigo: string;
  serie: string;
  cliente: string;
  monto: number;
  moneda: string;
  anulado_at: string;
  motivo: string | null;
  ejecuto: string | null;
  autorizo: string | null;
  comercial: string | null;
}

/**
 * Una cotización que se corrigió con el código que se dictó (migración 0123).
 * Va en la MISMA lista que los cierres anulados: para quien autoriza es lo
 * mismo —«¿qué se hizo hoy con mi código?»— y una sección aparte lo partiría
 * en dos sitios que hay que acordarse de mirar.
 */
interface FilaCorreccion {
  correccion_id: string;
  cotizacion_id: string;
  codigo: string | null;
  serie: string;
  cliente: string | null;
  version: number;
  motivo: string;
  guardada_at: string;
  total_antes: number | null;
  total_despues: number | null;
  moneda: string;
  corrigio: string | null;
  autorizo: string | null;
  resumen: unknown;
}

export default async function OperacionesPage() {
  const perfil = await requerirPerfil();
  const puede =
    perfil.rol === "operaciones" || perfil.es_operaciones || perfil.rol === "gerencia" || perfil.rol === "admin";
  if (!puede) redirect("/comercial");

  const supabase = await createClient();
  const [{ data }, { data: datosCorrecciones }] = await Promise.all([
    supabase.rpc("bitacora_autorizaciones", { p_dias: 90 }),
    supabase.rpc("bitacora_correcciones", { p_dias: 90 }),
  ]);
  const filas = (data ?? []) as unknown as FilaBitacora[];
  const correcciones = (datosCorrecciones ?? []) as unknown as FilaCorreccion[];

  // Una sola línea de tiempo: lo que pasó, en el orden en que pasó.
  const eventos = [
    ...filas.map((f) => ({ tipo: "anulacion" as const, cuando: f.anulado_at, anulacion: f, correccion: null })),
    ...correcciones.map((c) => ({ tipo: "correccion" as const, cuando: c.guardada_at, anulacion: null, correccion: c })),
  ].sort((a, b) => (a.cuando < b.cuando ? 1 : -1));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <SeccionPanel
        titulo="Lo que se autorizó"
        accion={
          <span className="text-xs text-muted-foreground">
            {eventos.length === 0 ? "nada en 90 días" : `${eventos.length} en 90 días`}
          </span>
        }
      >
        {eventos.length === 0 ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            Todavía no se usó ninguno de sus códigos. Cuando Central anule un cierre o un comercial corrija una
            cotización con su autorización, aparece acá con el motivo que escribió y qué cambió.
          </p>
        ) : (
          <div className="space-y-2">
            {eventos.map((e) =>
              e.tipo === "anulacion" ? (
                <article key={e.anulacion!.informe_id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">
                      cierre anulado
                    </span>
                    <span className="font-mono text-xs font-semibold text-foreground">
                      N.º {e.anulacion!.codigo} · {e.anulacion!.serie === "OPEN" ? "Open" : "Efameinsa"}
                    </span>
                    <span className="flex-1 text-sm font-medium text-foreground">{e.anulacion!.cliente}</span>
                    <span className="text-xs tabular-nums text-muted-foreground line-through">
                      {e.anulacion!.moneda} {Number(e.anulacion!.monto).toLocaleString("es-PE")}
                    </span>
                  </div>
                  {e.anulacion!.motivo && (
                    <p className="mt-1 text-xs leading-snug text-foreground">{e.anulacion!.motivo}</p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {fechaHoraLima(e.anulacion!.anulado_at)}
                    {e.anulacion!.ejecuto && ` · lo anuló ${e.anulacion!.ejecuto}`}
                    {e.anulacion!.autorizo && ` · autorizó ${e.anulacion!.autorizo}`}
                    {e.anulacion!.comercial && ` · el cierre era de ${e.anulacion!.comercial}`}
                  </p>
                </article>
              ) : (
                <article
                  key={e.correccion!.correccion_id}
                  className="rounded-lg border border-primary/30 bg-primary/[0.03] p-3"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      cotización corregida
                    </span>
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {e.correccion!.codigo} · {e.correccion!.serie === "OPEN" ? "Open" : "Efameinsa"}
                    </span>
                    <span className="flex-1 text-sm font-medium text-foreground">{e.correccion!.cliente}</span>
                    {/* Lo importante para quien autorizó: si el número que el
                        cliente ya tiene cambió de monto o no. */}
                    {e.correccion!.total_antes !== null && e.correccion!.total_despues !== null && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {Number(e.correccion!.total_antes) === Number(e.correccion!.total_despues) ? (
                          "mismo monto"
                        ) : (
                          <>
                            <span className="line-through">
                              {e.correccion!.moneda} {Number(e.correccion!.total_antes).toLocaleString("es-PE")}
                            </span>{" "}
                            <span className="font-semibold text-foreground">
                              → {e.correccion!.moneda} {Number(e.correccion!.total_despues).toLocaleString("es-PE")}
                            </span>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-snug text-foreground">{e.correccion!.motivo}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {fechaHoraLima(e.correccion!.guardada_at)}
                    {e.correccion!.corrigio && ` · la corrigió ${e.correccion!.corrigio}`}
                    {e.correccion!.autorizo && ` · autorizó ${e.correccion!.autorizo}`}
                    {` · quedó en la versión ${e.correccion!.version}, con el mismo número`}
                  </p>
                </article>
              ),
            )}
          </div>
        )}
      </SeccionPanel>

      <aside className="space-y-3">
        <CodigoAutorizacion />

        {/* Lo único que hace falta recordar, en un renglón: hasta dónde llega
            este código. El procedimiento no se explica acá — lo hace ella. */}
        <p className="rounded-lg border border-dashed border-border bg-secondary/40 p-3 text-[11px] leading-snug text-muted-foreground">
          Sirve para <strong className="text-foreground">anular un cierre</strong>,{" "}
          <strong className="text-foreground">corregir una derivación</strong> y{" "}
          <strong className="text-foreground">corregir una cotización sin cambiarle el número</strong> (el caso del
          leasing: al banco no se le puede dar otra numeración). Traspasar la cartera de un comercial a otro lo sigue
          autorizando gerencia.
        </p>
      </aside>
    </div>
  );
}
