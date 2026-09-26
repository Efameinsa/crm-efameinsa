import Link from "@/components/enlace";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BotonImprimir } from "@/components/crm/boton-imprimir";
import { TituloParaImprimir } from "@/components/crm/titulo-para-imprimir";
import { MembreteDocumento } from "@/components/crm/membrete-documento";

export const dynamic = "force-dynamic";

const sinRuc = (s: string | null | undefined) => (s ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima" }) : "—");

/**
 * LA GENERACIÓN DE CÓDIGO, PARA IMPRIMIR (Lesly, 25-09: «no tiene opción para
 * imprimir en esa parte de generación de código»).
 *
 * Lo que Central espera del almacén, en una hoja: cada pedido con su cliente,
 * su cierre, qué artículos y cuántas unidades, y una línea en blanco por
 * unidad para anotar la serie o el código en el almacén. Después se pasa al
 * CRM. Es una hoja interna: va con el membrete de la casa.
 */
export default async function CodigosParaImprimirPage() {
  await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase
    .from("servicios_postventa")
    .select("id, cliente_texto, series_pedidas_at, informes_cierre!servicios_postventa_informe_cierre_id_fkey(codigo, serie)")
    .not("series_pedidas_at", "is", null)
    .is("cerrado_at", null)
    .order("series_pedidas_at", { ascending: true })
    .limit(200);
  const pedidos = (data ?? []) as unknown as { id: string; cliente_texto: string | null; series_pedidas_at: string; informes_cierre: { codigo: string; serie: string } | null }[];

  const unidades: { servicio_id: string; orden: number; descripcion: string }[] = [];
  const ids = pedidos.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { data: filas } = await supabase
      .from("pedido_equipos")
      .select("servicio_id, orden, descripcion")
      .in("servicio_id", ids.slice(i, i + 100))
      .is("serie", null)
      .order("orden");
    unidades.push(...((filas ?? []) as typeof unidades));
  }
  const pendientes = pedidos
    .map((p) => ({ ...p, unidades: unidades.filter((u) => u.servicio_id === p.id) }))
    .filter((p) => p.unidades.length > 0);
  const total = pendientes.reduce((n, p) => n + p.unidades.length, 0);
  const hoy = new Date().toLocaleDateString("es-PE", { timeZone: "America/Lima" });

  return (
    <div className="hoja-informe mx-auto max-w-3xl bg-white p-8 text-[12.5px] leading-snug text-black">
      <div className="no-imprimir mb-4 flex items-center justify-between gap-3">
        <Link href="/almacen/pedidos?ver=series" className="text-xs text-muted-foreground hover:underline">
          ← Volver a Generación de código
        </Link>
        <TituloParaImprimir titulo={`Generacion de codigo ${hoy.replace(/\//g, "-")}`} />
        <BotonImprimir>Imprimir / guardar PDF</BotonImprimir>
      </div>

      <MembreteDocumento serie="EFAMEINSA" area="Almacén" generado={hoy} />

      <h1 className="text-center text-base font-bold uppercase">Generación de código</h1>
      <p className="mt-1 text-center text-[11px]">
        {pendientes.length === 0
          ? "No hay pedidos esperando código."
          : `${pendientes.length} pedido${pendientes.length === 1 ? "" : "s"} · ${total} unidad${total === 1 ? "" : "es"} por codificar`}
      </p>

      {pendientes.map((p) => {
        // Cuántas de cada artículo: «4 × CARRO DE LAVANDERÍA…».
        const titulos = [...new Set(p.unidades.map((u) => u.descripcion.split("\n")[0].trim()))];
        return (
          <section key={p.id} className="mt-4">
            <p className="font-bold">
              {sinRuc(p.cliente_texto)}
              {p.informes_cierre?.codigo ? ` · cierre ${p.informes_cierre.serie === "OPEN" ? "Open" : "Efameinsa"} ${p.informes_cierre.codigo}` : ""}
              <span className="font-normal"> · pedido el {fecha(p.series_pedidas_at)}</span>
            </p>
            <p className="text-[11px]">
              {titulos.map((t) => `${p.unidades.filter((u) => u.descripcion.split("\n")[0].trim() === t).length} × ${t}`).join(" · ")}
            </p>
            <table className="mt-1 w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  <th className="w-10 border border-neutral-500 bg-neutral-100 px-2 py-0.5 text-left">N.º</th>
                  <th className="border border-neutral-500 bg-neutral-100 px-2 py-0.5 text-left">Artículo</th>
                  <th className="w-56 border border-neutral-500 bg-neutral-100 px-2 py-0.5 text-left">Serie o código</th>
                </tr>
              </thead>
              <tbody>
                {p.unidades.map((u) => (
                  <tr key={`${p.id}-${u.orden}`}>
                    <td className="border border-neutral-500 px-2 py-1.5">{u.orden}</td>
                    <td className="border border-neutral-500 px-2 py-1.5">{u.descripcion.split("\n")[0]}</td>
                    <td className="border border-neutral-500 px-2 py-1.5" />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body *:not(:has(.hoja-informe)):not(.hoja-informe):not(.hoja-informe *) { display: none !important; }
          body *:has(.hoja-informe) { min-height: 0 !important; height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; border: 0 !important; box-shadow: none !important; background: transparent !important; }
          html, body { background: #fff !important; }
          .hoja-informe { max-width: none; padding: 0; margin: 0; }
          .no-imprimir { display: none !important; }
          tr, section { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
