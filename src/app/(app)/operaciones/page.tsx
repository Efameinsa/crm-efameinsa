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

export default async function OperacionesPage() {
  const perfil = await requerirPerfil();
  const puede =
    perfil.rol === "operaciones" || perfil.es_operaciones || perfil.rol === "gerencia" || perfil.rol === "admin";
  if (!puede) redirect("/comercial");

  const supabase = await createClient();
  const { data } = await supabase.rpc("bitacora_autorizaciones", { p_dias: 90 });
  const filas = (data ?? []) as unknown as FilaBitacora[];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <SeccionPanel
        titulo="Lo que se autorizó"
        accion={
          <span className="text-xs text-muted-foreground">
            {filas.length === 0 ? "nada en 90 días" : `${filas.length} en 90 días`}
          </span>
        }
      >
        {filas.length === 0 ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            Todavía no se autorizó ninguna corrección. Cuando Central anule un cierre con su código, aparece acá con el
            motivo que escribió, a quién le tocaba ese cierre y quién lo autorizó.
          </p>
        ) : (
          <div className="space-y-2">
            {filas.map((f) => (
              <article key={f.informe_id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs font-semibold text-foreground">
                    N.º {f.codigo} · {f.serie === "OPEN" ? "Open" : "Efameinsa"}
                  </span>
                  <span className="flex-1 text-sm font-medium text-foreground">{f.cliente}</span>
                  <span className="text-xs tabular-nums text-muted-foreground line-through">
                    {f.moneda} {Number(f.monto).toLocaleString("es-PE")}
                  </span>
                </div>
                {f.motivo && <p className="mt-1 text-xs leading-snug text-foreground">{f.motivo}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {fechaHoraLima(f.anulado_at)}
                  {f.ejecuto && ` · lo anuló ${f.ejecuto}`}
                  {f.autorizo && ` · autorizó ${f.autorizo}`}
                  {f.comercial && ` · el cierre era de ${f.comercial}`}
                </p>
              </article>
            ))}
          </div>
        )}
      </SeccionPanel>

      <aside className="space-y-3">
        <CodigoAutorizacion />

        {/* Lo único que hace falta recordar, en un renglón: hasta dónde llega
            este código. El procedimiento no se explica acá — lo hace ella. */}
        <p className="rounded-lg border border-dashed border-border bg-secondary/40 p-3 text-[11px] leading-snug text-muted-foreground">
          Sirve para <strong className="text-foreground">anular un cierre</strong> y{" "}
          <strong className="text-foreground">corregir una derivación</strong>. Traspasar la cartera de un comercial a
          otro lo sigue autorizando gerencia.
        </p>
      </aside>
    </div>
  );
}
