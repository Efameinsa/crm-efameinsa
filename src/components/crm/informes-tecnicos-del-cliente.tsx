import Link from "next/link";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { etiquetaTipoServicio } from "@/lib/postventa";
import { fechaHoraLima } from "@/lib/fechas";

/**
 * LOS INFORMES TÉCNICOS DEL CLIENTE, EN SU FICHA (28-09).
 *
 * Rubí buscaba el informe técnico que el almacén registró al atender la
 * videollamada de KARINA SAAVEDRA HOSPEDAJE (N.º 004-2026) y no estaba en la
 * ficha del cliente: la ficha nunca listó `informes_servicio`. Solo salían en
 * la ficha de una máquina, y los informes que nacen de una llamada derivada no
 * tienen máquina enlazada, así que no aparecían en ningún lado.
 */
export async function InformesTecnicosDelCliente({ cuentaId, conEnlace }: { cuentaId: string; conEnlace: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("informes_servicio")
    .select("id, correlativo, anio, tipo, modalidad, ejecutado_at, emitido_at, tecnico, equipo_texto, detalle, es_prueba")
    .eq("cuenta_id", cuentaId)
    .order("ejecutado_at", { ascending: false })
    .limit(50);
  const informes = data ?? [];
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <p className="border-b border-border px-4 py-3 text-[13px] font-bold uppercase tracking-wide text-foreground">
        Informes técnicos ({informes.length})
      </p>
      {informes.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Todavía no hay informes técnicos de este cliente en el CRM. Los de antes del CRM están en «Documentos y sedes», en la carpeta del servidor.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {informes.map((i) => {
            const numero =
              i.correlativo != null ? `N.º ${i.es_prueba ? "PRUEBA " : ""}${String(i.correlativo).padStart(3, "0")}-${i.anio}` : "Borrador";
            const contenido = (
              <>
                <FileText className="mt-0.5 size-4 flex-none text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">
                    {etiquetaTipoServicio(i.tipo as string)} · {numero}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {fechaHoraLima(i.ejecutado_at as string)}
                      {i.modalidad === "videollamada" ? " · videollamada" : i.modalidad === "planta" ? " · en planta" : ""}
                      {i.tecnico ? ` · ${i.tecnico}` : ""}
                      {!i.emitido_at ? " · sin emitir" : ""}
                    </span>
                  </span>
                  {(i.equipo_texto || i.detalle) && (
                    <span className="line-clamp-2 text-xs text-muted-foreground">{[i.equipo_texto, i.detalle].filter(Boolean).join(" · ")}</span>
                  )}
                </span>
              </>
            );
            return (
              <li key={i.id}>
                {conEnlace ? (
                  <Link href={`/postventa/informes/${i.id}`} className="flex items-start gap-2 px-4 py-2.5 transition-colors hover:bg-accent">
                    {contenido}
                  </Link>
                ) : (
                  <div className="flex items-start gap-2 px-4 py-2.5">{contenido}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
