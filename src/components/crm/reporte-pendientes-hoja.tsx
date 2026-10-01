import Link from "@/components/enlace";
import { FileSpreadsheet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import type { ServicioPostventa } from "@/lib/postventa";
import { cargarPedidosPendientes, filasPendientes } from "@/lib/reporte-pendientes";
import { BotonImprimir } from "@/components/crm/boton-imprimir";
import { TituloParaImprimir } from "@/components/crm/titulo-para-imprimir";
import { MembreteDocumento } from "@/components/crm/membrete-documento";

/**
 * EL REPORTE DE PENDIENTES EN PDF (Lesly, 01-10: «el reporte que se genera de
 * almacén manda como Excel y no como PDF»). Los mismos datos que el Excel
 * (`filasPendientes`), en una hoja para imprimir o guardar como PDF. Para el
 * almacén va primero lo que le toca; después, todos los pedidos en curso.
 * Sin precios: es un documento que circula. El Excel sigue a un clic.
 */
export async function ReportePendientesHoja({ deAlmacen, volver }: { deAlmacen: boolean; volver: { href: string; texto: string } }) {
  const supabase = await createClient();
  const { data } = await cargarPedidosPendientes(supabase);
  const hoy = hoyLima();
  const { pedidos, pasos } = filasPendientes((data ?? []) as unknown as ServicioPostventa[], hoy);
  const delAlmacen = pasos.filter((p) => p.delAlmacen);
  const fechaHoy = new Date(`${hoy}T12:00:00-05:00`).toLocaleDateString("es-PE", { timeZone: "America/Lima" });
  const titulo = `${deAlmacen ? "Pendientes del almacen" : "Pendientes de pedidos"} ${hoy}`;
  const corto = (t: string, n = 90) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const th = "border border-neutral-500 bg-neutral-100 px-1.5 py-0.5 text-left align-bottom";
  const td = "border border-neutral-500 px-1.5 py-1 align-top";

  const tablaAlmacen = (
    <section className="mt-4">
      <h2 className="text-[13px] font-bold uppercase">Lo que le toca al almacén · {delAlmacen.length}</h2>
      {delAlmacen.length === 0 ? (
        <p className="mt-1">Nada pendiente del almacén.</p>
      ) : (
        <table className="mt-1 w-full border-collapse text-[10.5px]">
          <thead>
            <tr>
              <th className={th}>Cliente</th>
              <th className={th}>Equipo</th>
              <th className={th}>Paso pendiente</th>
              <th className={th}>Por qué no avanza</th>
              <th className={`${th} w-20`}>Despacho</th>
            </tr>
          </thead>
          <tbody>
            {delAlmacen.map((p, i) => (
              <tr key={i}>
                <td className={td}>
                  <b>{p.cliente}</b>
                  {p.pedido ? <span className="block text-[9.5px]">Pedido {p.pedido}</span> : null}
                </td>
                <td className={td}>{corto(p.equipo)}</td>
                <td className={td}>{p.paso}</td>
                <td className={td}>{p.porQue}</td>
                <td className={td}>{p.despacho || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );

  const tablaPedidos = (
    <section className="mt-5">
      <h2 className="text-[13px] font-bold uppercase">Pedidos en curso · {pedidos.length}</h2>
      <table className="mt-1 w-full border-collapse text-[10.5px]">
        <thead>
          <tr>
            <th className={th}>Cliente</th>
            <th className={th}>Equipo</th>
            <th className={th}>Fase</th>
            <th className={`${th} w-12`}>Avance</th>
            <th className={th}>Qué lo frena</th>
            <th className={`${th} w-20`}>Depende de</th>
            <th className={`${th} w-20`}>Despacho</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p, i) => (
            <tr key={i}>
              <td className={td}>
                <b>{p.cliente}</b>
                {p.pedido ? <span className="block text-[9.5px]">Pedido {p.pedido}</span> : null}
              </td>
              <td className={td}>{corto(p.equipo, 70)}</td>
              <td className={td}>{p.fase}</td>
              <td className={td}>{p.avance}</td>
              <td className={td}>{p.frena}</td>
              <td className={td}>{p.dependeDe}</td>
              <td className={td}>
                {p.despacho || "—"}
                {p.atrasado ? <b className="block">atrasado</b> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );

  return (
    <div className="hoja-informe mx-auto max-w-6xl bg-white p-8 text-[12px] leading-snug text-black">
      <div className="no-imprimir mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={volver.href} className="text-xs text-muted-foreground hover:underline">
          ← {volver.texto}
        </Link>
        <TituloParaImprimir titulo={titulo} />
        <span className="flex items-center gap-2">
          <a
            href={`/api/postventa/pedidos/reporte${deAlmacen ? "?de=almacen" : ""}`}
            download
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            <FileSpreadsheet className="size-3.5" aria-hidden /> Bajar en Excel
          </a>
          <BotonImprimir>Imprimir / guardar PDF</BotonImprimir>
        </span>
      </div>

      <MembreteDocumento serie="EFAMEINSA" area={deAlmacen ? "Almacén" : "Postventa"} generado={fechaHoy} />

      <h1 className="text-center text-base font-bold uppercase">{deAlmacen ? "Pendientes del almacén" : "Pendientes de pedidos"}</h1>
      <p className="mt-1 text-center text-[11px]">
        Al {fechaHoy} · {pedidos.length} pedido{pedidos.length === 1 ? "" : "s"} en curso · {delAlmacen.length} paso{delAlmacen.length === 1 ? "" : "s"} del almacén
      </p>

      {deAlmacen ? (
        <>
          {tablaAlmacen}
          {tablaPedidos}
        </>
      ) : (
        <>
          {tablaPedidos}
          {tablaAlmacen}
        </>
      )}

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body *:not(:has(.hoja-informe)):not(.hoja-informe):not(.hoja-informe *) { display: none !important; }
          body *:has(.hoja-informe) { min-height: 0 !important; height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; border: 0 !important; box-shadow: none !important; background: transparent !important; }
          html, body { background: #fff !important; }
          .hoja-informe { max-width: none; padding: 0; margin: 0; }
          .no-imprimir { display: none !important; }
          tr { break-inside: avoid; }
          thead { display: table-header-group; }
        }
      `}</style>
    </div>
  );
}
