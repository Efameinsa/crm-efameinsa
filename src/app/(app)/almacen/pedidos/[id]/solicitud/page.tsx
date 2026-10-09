import Link from "@/components/enlace";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BotonImprimir } from "@/components/crm/boton-imprimir";
import { TituloParaImprimir } from "@/components/crm/titulo-para-imprimir";
import { MembreteDocumento } from "@/components/crm/membrete-documento";
import { RegistroNoDisponible } from "@/components/crm/registro-no-disponible";
import { CasillasProcedencia } from "@/components/crm/casillas-procedencia";
import { esTorre } from "@/lib/torres";

export const dynamic = "force-dynamic";

const sinRuc = (s: string | null | undefined) => (s ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
const fechaHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const quien = (p: { nombre: string; codigo_comercial: string | null } | null | undefined) =>
  p ? `${p.codigo_comercial ? `${p.codigo_comercial} · ` : ""}${p.nombre}` : "—";

type Perfil = { nombre: string; codigo_comercial: string | null } | null;
type Unidad = {
  id: string;
  orden: number;
  parte_de: string | null;
  parte_nombre: string | null;
  descripcion: string;
  serie: string | null;
  sin_serie: boolean | null;
  procedencia: string | null;
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
 *
 * Lesly, 09-10: la torre (lavadora + secadora, 0359) salía en dos filas y
 * parecían dos torres. Ahora la parte va en la MISMA fila de su unidad:
 * «Lavadora: …» y «Secadora: …» dentro de la celda de la serie. La torre que
 * aún no tiene la secadora registrada deja los dos renglones para anotar.
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
    .select("id, orden, parte_de, parte_nombre, descripcion, serie, sin_serie, procedencia, serie_registrada_at, perfiles!pedido_equipos_serie_registrada_por_fkey(nombre, codigo_comercial)")
    .eq("servicio_id", id)
    .order("orden");
  const todas = (filas ?? []) as unknown as Unidad[];
  const unidades = todas.filter((u) => !u.parte_de);
  // Las series de cada fila: la unidad y sus partes (torre: lavadora y secadora).
  const lineasDe = (u: Unidad) => {
    const partes = todas.filter((p) => p.parte_de === u.id);
    const torre = esTorre(u.descripcion) && !(u.serie ?? "").includes("/");
    if (partes.length === 0 && !torre) return [{ nombre: null as string | null, fila: u as Unidad | null }];
    return [
      { nombre: torre ? "Lavadora" : "Máquina", fila: u as Unidad | null },
      ...(partes.length ? partes.map((p) => ({ nombre: p.parte_nombre ?? "Otra máquina", fila: p as Unidad | null })) : [{ nombre: "Secadora", fila: null }]),
    ];
  };
  const respondidas = unidades.filter((u) => lineasDe(u).every((l) => l.fila?.serie)).length;
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
            <th className={`${cabecera} w-32`}>Procedencia</th>
            {respuesta && <th className={`${cabecera} w-48`}>Registró</th>}
          </tr>
        </thead>
        <tbody>
          {unidades.map((u) => {
            const lineas = lineasDe(u);
            const varias = lineas.length > 1;
            const serieDe = (f: Unidad | null) =>
              f?.serie ? <>{f.serie}{f.sin_serie ? <span className="block text-[10px]">código (sin serie)</span> : null}</> : <i>pendiente</i>;
            const registroDe = (f: Unidad | null) =>
              f?.serie ? (f.serie_registrada_at ? <>{quien(f.perfiles)}<span className="block text-[10px]">{fechaHora(f.serie_registrada_at)}</span></> : "antes del 28-09") : "—";
            return (
              <tr key={u.id}>
                <td className={celda}>{u.orden}</td>
                <td className={`${celda} whitespace-pre-line`}>
                  {u.descripcion}
                  {varias && <span className="mt-1 block text-[10.5px] font-semibold">1 torre: {lineas.map((l) => l.nombre?.toLowerCase()).join(" + ")}</span>}
                </td>
                <td className={celda}>
                  {varias ? (
                    lineas.map((l, i) => (
                      <div key={i} className={i ? "mt-2 border-t border-dashed border-neutral-400 pt-2" : ""}>
                        <span className="block text-[10.5px] font-semibold uppercase">{l.nombre}</span>
                        {respuesta ? serieDe(l.fila) : <span className="mt-4 block border-b border-neutral-400" />}
                      </div>
                    ))
                  ) : respuesta ? (
                    serieDe(u)
                  ) : null}
                </td>
                <td className={`${celda} text-[10.5px] leading-tight`}>
                  <CasillasProcedencia marcada={u.procedencia} />
                </td>
                {respuesta && (
                  <td className={celda}>
                    {varias
                      ? lineas.map((l, i) => (
                          <div key={i} className={i ? "mt-2 border-t border-dashed border-neutral-400 pt-2" : ""}>
                            <span className="block text-[10.5px] font-semibold uppercase">{l.nombre}</span>
                            {registroDe(l.fila)}
                          </div>
                        ))
                      : registroDe(u)}
                  </td>
                )}
              </tr>
            );
          })}
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
