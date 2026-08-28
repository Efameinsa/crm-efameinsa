import { redirect } from "next/navigation";
import { Ban, KeyRound } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaHoraLima } from "@/lib/fechas";

export const dynamic = "force-dynamic";

/**
 * La pantalla del administrador de operaciones (reunión con gerencia del 28-08).
 *
 * «Mañana no estás… Lesly se encarga, le cedemos la posta. Cualquier
 * autorización, ella tiene que ingresar para dar autorización.»
 *
 * Su trabajo entero cabe en dos preguntas, y esta pantalla contesta las dos:
 * qué código dicto ahora, y qué se hizo con los que dicté. Lo primero está en
 * la barra —donde lo tiene a mano cuando la llaman por teléfono, sin salir de
 * lo que estaba haciendo— y acá se explica cuándo se pide. Lo segundo es la
 * lista de abajo, que es la parte que convierte «dar un código» en autorizar:
 * dictar a ciegas y no volver a saber qué pasó no es autorizar, es adivinar.
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
  const puede = perfil.es_operaciones || perfil.rol === "gerencia" || perfil.rol === "admin";
  if (!puede) redirect("/comercial");

  const supabase = await createClient();
  const { data } = await supabase.rpc("bitacora_autorizaciones", { p_dias: 90 });
  const filas = (data ?? []) as unknown as FilaBitacora[];

  return (
    <div className="space-y-4">
      <SeccionPanel titulo="Autorizaciones">
        <div className="space-y-3">
          <p className="max-w-prose text-sm leading-snug text-muted-foreground">
            Su código está en la barra de la izquierda. <strong className="text-foreground">No se muestra solo</strong>:
            hay que pedirlo, dura diez minutos y sirve para una corrección. Si hacen falta dos, son dos llamadas.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <KeyRound className="size-3.5" /> Cuándo se lo van a pedir
              </p>
              <p className="mt-1 text-sm leading-snug text-foreground">
                Central encuentra un cierre equivocado —el equipo no es, el monto no coincide con el voucher— y
                necesita anularlo. La llama, usted dicta el código y ella anula.
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <Ban className="size-3.5" /> Qué pasa después
              </p>
              <p className="mt-1 text-sm leading-snug text-foreground">
                El informe se queda con su número y deja de contar; la venta se anula con él y el comercial emite uno
                nuevo. Nada se borra.
              </p>
            </div>
          </div>

          {/* Lo que su código NO abre. Vale decirlo: es la diferencia entre una
              facultad acotada y una llave maestra, y es lo que hace que se
              pueda delegar sin miedo. */}
          <p className="max-w-prose rounded-md border border-dashed border-border bg-secondary/40 p-2.5 text-xs leading-snug text-muted-foreground">
            Su código autoriza correcciones <strong className="text-foreground">operativas</strong>. Mover la cartera de
            un comercial a otro sigue siendo de gerencia: eso es plata de alguien y se autoriza aparte.
          </p>
        </div>
      </SeccionPanel>

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
            Todavía no se anuló ningún cierre. Cuando Central anule uno con un código, aparece acá con el motivo que
            escribió y quién lo autorizó.
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
    </div>
  );
}
