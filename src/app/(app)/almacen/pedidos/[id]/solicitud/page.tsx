import Link from "@/components/enlace";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BotonImprimir } from "@/components/crm/boton-imprimir";
import { TituloParaImprimir } from "@/components/crm/titulo-para-imprimir";
import { MembreteDocumento } from "@/components/crm/membrete-documento";
import { RegistroNoDisponible } from "@/components/crm/registro-no-disponible";

export const dynamic = "force-dynamic";

const sinRuc = (s: string | null | undefined) => (s ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
const fechaHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const quien = (p: { nombre: string; codigo_comercial: string | null } | null | undefined) =>
  p ? `${p.codigo_comercial ? `${p.codigo_comercial} · ` : ""}${p.nombre}` : "—";

type Perfil = { nombre: string; codigo_comercial: string | null } | null;
type Unidad = {
  orden: number;
  descripcion: string;
  serie: string | null;
  sin_serie: boolean | null;
  serie_registrada_at: string | null;
  perfiles: Perfil;
};

/**
 * LA SOLICITUD DE CÓDIGO Y LA RESPUESTA DEL ALMACÉN, DE UN PEDIDO (0316).
 * Lesly, 28-09, en el pedido del almacén: «debe tener la opción de imprimir
 * la solicitud y, así mismo, cuando responden, también imprimirlo».
 *
 * `?que=solicitud`: lo que Central pidió (quién, cuándo, qué unidades), con
 * una línea en blanco por unidad para anotar la serie en el almacén.
 * `?que=respuesta`: la serie o el código que el almacén dio a cada unidad,
 * quién lo registró y cuándo. Las que faltan salen como pendientes.
 */
export default async function SolicitudDeCodigoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ que?: string }>;
}) {
  const { id } = await params;
  const respuesta = (await searchParams).que === "respuesta";
  await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase
    .from("servicios_postventa")
    .select(
      "id, cliente_texto, numero_pedido_erp, series_pedidas_at, perfiles!servicios_postventa_series_pedidas_por_fkey(nombre, codigo_comercial), informes_cierre!servicios_postventa_informe_cierre_id_fkey(codigo, serie)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return <RegistroNoDisponible volverHref="/almacen/pedidos" volverTexto="Volver a los pedidos" />;
  const pedido = data as unknown as {
    id: string;
    cliente_texto: string | null;
    numero_pedido_erp: string | null;
    series_pedidas_at: string | null;
    perfiles: Perfil;
    informes_cierre: { codigo: string; serie: string } | null;
  };
  const { data: filas } = await supabase
    .from("pedido_equipos")
    .select("orden, descripcion, serie, sin_serie, serie_registrada_at, perfiles!pedido_equipos_serie_registrada_por_fkey(nombre, codigo_comercial)")
    .eq("servicio_id", id)
    .order("orden");
  const unidades = (filas ?? []) as unknown as Unidad[];
  const respondidas = unidades.filter((u) => u.serie).length;
  const hoy = new Date().toLocaleDateString("es-PE", { timeZone: "America/Lima" });
  const cierre = pedido.informes_cierre;
  const titulo = respuesta ? "Respuesta del almacén · series y códigos" : "Solicitud de código al almacén";
  const celda = "border border-neutral-500 px-2 py-1.5 align-top";
  const cabecera = "border border-neutral-500 bg-neutral-100 px-2 py-0.5 text-left";

  return (
    <div className="hoja-informe mx-auto max-w-3xl bg-white p-8 text-[12.5px] leading-snug text-black">
      <div className="no-imprimir mb-4 flex items-center justify-between gap-3">
        <Link href={`/almacen/pedidos/${id}`} className="text-xs text-muted-foreground hover:underline">
          ← Volver al pedido
        </Link>
        <TituloParaImprimir titulo={`${respuesta ? "Respuesta almacen" : "Solicitud de codigo"} ${pedido.numero_pedido_erp ?? ""} ${sinRuc(pedido.cliente_texto)}`.trim()} />
        <BotonImprimir>Imprimir / guardar PDF</BotonImprimir>
      </div>

      <MembreteDocumento serie={cierre?.serie === "OPEN" ? "OPEN" : "EFAMEINSA"} area="Almacén" generado={hoy} />

      <h1 className="text-center text-base font-bold uppercase">{titulo}</h1>

      <table className="mt-3 w-full border-collapse text-[12px]">
        <tbody>
          <tr><th className={`${cabecera} w-44`}>Cliente</th><td className={celda}>{sinRuc(pedido.cliente_texto)}</td></tr>
          <tr><th className={cabecera}>Pedido</th><td className={celda}>{pedido.numero_pedido_erp ?? "—"}</td></tr>
          {cierre?.codigo && (
            <tr><th className={cabecera}>Cierre</th><td className={celda}>{cierre.serie === "OPEN" ? "Open" : "Efameinsa"} {cierre.codigo}</td></tr>
          )}
          <tr><th className={cabecera}>Solicitado por</th><td className={celda}>{quien(pedido.perfiles)} · {fechaHora(pedido.series_pedidas_at)}</td></tr>
          {respuesta && (
            <tr>
              <th className={cabecera}>Estado</th>
              <td className={celda}>
                {respondidas === unidades.length
                  ? `Respondida: ${unidades.length} unidad${unidades.length === 1 ? "" : "es"} con serie o código`
                  : `${respondidas} de ${unidades.length} unidades respondidas · faltan ${unidades.length - respondidas}`}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <table className="mt-4 w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className={`${cabecera} w-10`}>N.º</th>
            <th className={cabecera}>Artículo</th>
            <th className={`${cabecera} w-48`}>Serie o código</th>
            {respuesta && <th className={`${cabecera} w-48`}>Registró</th>}
          </tr>
        </thead>
        <tbody>
          {unidades.map((u) => (
            <tr key={u.orden}>
              <td className={celda}>{u.orden}</td>
              <td className={`${celda} whitespace-pre-line`}>{u.descripcion}</td>
              <td className={celda}>
                {respuesta ? (u.serie ? <>{u.serie}{u.sin_serie ? <span className="block text-[10px]">código (sin serie)</span> : null}</> : <i>pendiente</i>) : null}
              </td>
              {respuesta && (
                <td className={celda}>
                  {u.serie ? (u.serie_registrada_at ? <>{quien(u.perfiles)}<span className="block text-[10px]">{fechaHora(u.serie_registrada_at)}</span></> : "antes del 28-09") : "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-10 grid grid-cols-2 gap-10 text-center text-[11px]">
        <div className="border-t border-neutral-600 pt-1">{respuesta ? "Almacén" : "Central (solicita)"}</div>
        <div className="border-t border-neutral-600 pt-1">{respuesta ? "Central (recibe)" : "Almacén (recibe)"}</div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body *:not(:has(.hoja-informe)):not(.hoja-informe):not(.hoja-informe *) { display: none !important; }
          body *:has(.hoja-informe) { min-height: 0 !important; height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; border: 0 !important; box-shadow: none !important; background: transparent !important; }
          html, body { background: #fff !important; }
          .hoja-informe { max-width: none; padding: 0; margin: 0; }
          .no-imprimir { display: none !important; }
          tr { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
