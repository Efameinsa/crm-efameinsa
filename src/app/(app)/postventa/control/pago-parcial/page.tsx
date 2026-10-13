import Link from "@/components/enlace";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { puedeVerPrecios, type ServicioPostventa } from "@/lib/postventa";
import { cargarPedidosPendientes, filasPagoParcial } from "@/lib/reporte-pendientes";
import { BotonImprimir } from "@/components/crm/boton-imprimir";
import { TituloParaImprimir } from "@/components/crm/titulo-para-imprimir";
import { MembreteDocumento } from "@/components/crm/membrete-documento";

export const dynamic = "force-dynamic";

/**
 * EL INFORME DE PAGOS PARCIALES PARA GERENCIA (buzón, Ariana 13-10). Los
 * pedidos en curso que deja el filtro «Pago parcial» de la tabla por paso,
 * en una hoja para imprimir o guardar como PDF y mandar. Las cifras salen
 * solo para quien puede verlas: a postventa no (puedeVerPrecios).
 */
export default async function InformePagoParcialPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data } = await cargarPedidosPendientes(supabase);
  const conCifras = puedeVerPrecios(perfil);
  const filas = filasPagoParcial((data ?? []) as unknown as ServicioPostventa[], conCifras);
  const hoy = hoyLima();
  const fechaHoy = new Date(`${hoy}T12:00:00-05:00`).toLocaleDateString("es-PE", { timeZone: "America/Lima" });
  const empresas = new Set(filas.map((f) => f.ruc || f.cliente)).size;
  const monto = (n: number | null, moneda: string) =>
    n == null ? "—" : `${moneda === "USD" ? "US$" : "S/"} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const th = "border border-neutral-500 bg-neutral-100 px-1.5 py-0.5 text-left align-bottom";
  const td = "border border-neutral-500 px-1.5 py-1 align-top";

  return (
    <div className="hoja-informe mx-auto max-w-6xl bg-white p-8 text-[12px] leading-snug text-black">
      <div className="no-imprimir mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/postventa/control?vista=paso&falta=pago_parcial" className="text-xs text-muted-foreground hover:underline">
          ← Volver a Pedidos por paso
        </Link>
        <TituloParaImprimir titulo={`Pedidos con pago parcial ${hoy}`} />
        <BotonImprimir>Imprimir / guardar PDF</BotonImprimir>
      </div>

      <MembreteDocumento serie="EFAMEINSA" area="Postventa" generado={fechaHoy} />

      <h1 className="text-center text-base font-bold uppercase">Clientes con pago parcial</h1>
      <p className="mt-1 text-center text-[11px]">
        Al {fechaHoy} · {filas.length} pedido{filas.length === 1 ? "" : "s"} en curso de {empresas} cliente{empresas === 1 ? "" : "s"} que
        pagaron una parte y deben el saldo · Preparado por {perfil.nombre}
      </p>

      {filas.length === 0 ? (
        <p className="mt-5 text-center">Hoy ningún pedido en curso tiene un pago parcial registrado.</p>
      ) : (
        <table className="mt-4 w-full border-collapse text-[10.5px]">
          <thead>
            <tr>
              <th className={`${th} w-6`}>N.º</th>
              <th className={th}>Cliente</th>
              <th className={th}>Equipo</th>
              <th className={th}>Forma de pago</th>
              {conCifras && (
                <>
                  <th className={`${th} w-20 text-right`}>Total</th>
                  <th className={`${th} w-20 text-right`}>Pagado</th>
                  <th className={`${th} w-20 text-right`}>Saldo</th>
                </>
              )}
              <th className={th}>Finanzas</th>
              <th className={`${th} w-24`}>Despacho</th>
              <th className={th}>Qué lo frena</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                <td className={td}>{i + 1}</td>
                <td className={td}>
                  <b>{f.cliente}</b>
                  {f.ruc ? <span className="block text-[9.5px]">RUC/DNI {f.ruc}</span> : null}
                  {f.pedido ? <span className="block text-[9.5px]">Pedido {f.pedido}</span> : null}
                </td>
                <td className={td}>{f.equipo.length > 80 ? `${f.equipo.slice(0, 79)}…` : f.equipo}</td>
                <td className={td}>{f.formaPago || "—"}</td>
                {conCifras && (
                  <>
                    <td className={`${td} text-right`}>{monto(f.total, f.moneda)}</td>
                    <td className={`${td} text-right`}>{monto(f.pagado, f.moneda)}</td>
                    <td className={`${td} text-right font-bold`}>{monto(f.saldo, f.moneda)}</td>
                  </>
                )}
                <td className={td}>{f.finanzas}</td>
                <td className={td}>{f.despacho}</td>
                <td className={td}>{f.frena || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!conCifras && filas.length > 0 && (
        <p className="mt-2 text-[10px] text-neutral-600">Los montos (total, pagado y saldo) no salen en este informe: Gerencia los ve en el CRM, en cada pedido.</p>
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
