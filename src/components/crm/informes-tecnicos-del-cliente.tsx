import Link from "next/link";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { etiquetaTipoServicio } from "@/lib/postventa";
import { fechaHoraLima } from "@/lib/fechas";
import { MOTIVO_APERTURA, numeroInforme, type TipoApertura } from "@/lib/aperturas-llamada";
import { ETIQUETA_TIPO_ATENCION, type TipoAtencion } from "@/lib/atenciones";

type Origen = {
  apertura: { id: string; tipo: TipoApertura; solicitada_at: string; solicitada_por: string | null } | null;
  caso: { id: string; tipo: TipoAtencion; solicitado_at: string | null; recibido_por: string | null } | null;
};

/**
 * LOS INFORMES TÉCNICOS DEL CLIENTE, EN SU FICHA (28-09).
 *
 * Rubí buscaba el informe técnico que el almacén registró al atender la
 * videollamada de KARINA SAAVEDRA HOSPEDAJE (N.º 004-2026) y no estaba en la
 * ficha del cliente: la ficha nunca listó `informes_servicio`. Solo salían en
 * la ficha de una máquina, y los informes que nacen de una llamada derivada no
 * tienen máquina enlazada, así que no aparecían en ningún lado.
 *
 * QUIÉN LO PIDIÓ Y DESDE DÓNDE (reunión 28-09 14:18): «¿quién solicitó ese
 * informe? ¿Quién ha pedido que se haga esa llamada? Porque la llamada es un
 * informe… tiene que estar para saber cuál fue el correlativo de la gestión
 * que se hizo… ¿cómo enlazamos esta llamada?». Cada informe dice qué lo
 * originó —la llamada derivada (tipo, quién la derivó y cuándo) o el caso— con
 * el enlace para abrirlo.
 */
export async function InformesTecnicosDelCliente({ cuentaId, conEnlace }: { cuentaId: string; conEnlace: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("informes_servicio")
    .select(
      "id, correlativo, anio, tipo, modalidad, ejecutado_at, emitido_at, tecnico, equipo_texto, detalle, es_prueba, apertura:aperturas_llamada!informes_servicio_apertura_id_fkey(id, tipo, solicitada_at, solicitada_por), caso:atenciones!informes_servicio_atencion_id_fkey(id, tipo, solicitado_at, recibido_por)",
    )
    .eq("cuenta_id", cuentaId)
    .order("ejecutado_at", { ascending: false })
    .limit(50);
  const informes = (data ?? []) as unknown as ({
    id: string;
    correlativo: number | null;
    anio: number | null;
    tipo: string;
    modalidad: string | null;
    ejecutado_at: string;
    emitido_at: string | null;
    tecnico: string | null;
    equipo_texto: string | null;
    detalle: string | null;
    es_prueba: boolean | null;
  } & Origen)[];
  // Los nombres de quien derivó la llamada o registró el caso.
  const ids = [...new Set(informes.flatMap((i) => [i.apertura?.solicitada_por, i.caso?.recibido_por]).filter(Boolean) as string[])];
  const { data: gente } = ids.length ? await supabase.from("perfiles").select("id, nombre").in("id", ids) : { data: [] };
  const nombre = (x: string | null | undefined) => (x ? ((gente ?? []) as { id: string; nombre: string }[]).find((g) => g.id === x)?.nombre ?? null : null);
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
            const n = numeroInforme(i);
            const numero = n ? `N.º ${n}` : "Borrador";
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
            // De dónde salió: la llamada derivada o el caso, con quién y cuándo.
            const origen = i.apertura
              ? {
                  texto: `Pedido por ${nombre(i.apertura.solicitada_por) ?? "—"} el ${fechaHoraLima(i.apertura.solicitada_at)} · derivación de llamada: ${MOTIVO_APERTURA[i.apertura.tipo]?.toLowerCase() ?? i.apertura.tipo}`,
                  href: `/aperturas/${i.apertura.id}`,
                  abrir: "Ver la derivación",
                }
              : i.caso
                ? {
                    texto: `Del caso de ${(ETIQUETA_TIPO_ATENCION[i.caso.tipo] ?? String(i.caso.tipo)).toLowerCase()}${nombre(i.caso.recibido_por) ? ` registrado por ${nombre(i.caso.recibido_por)}` : ""}${i.caso.solicitado_at ? ` el ${fechaHoraLima(i.caso.solicitado_at)}` : ""}`,
                    href: `/postventa/atenciones/${i.caso.id}`,
                    abrir: "Ver el caso",
                  }
                : null;
            const lineaOrigen = origen && (
              <span className="ml-6 block pb-2 pr-4 text-[11px] text-muted-foreground">
                {origen.texto}
                {conEnlace && (
                  <>
                    {" · "}
                    <Link href={origen.href} className="font-medium text-primary hover:underline">
                      {origen.abrir} →
                    </Link>
                  </>
                )}
              </span>
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
                {lineaOrigen}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
