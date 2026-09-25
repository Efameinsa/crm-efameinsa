import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { ETIQUETA_TIPO_APERTURA, FILAS_FORMATO, problemaConEquipo, type AperturaLlamada, type FormatoLlamada } from "@/lib/aperturas-llamada";
import { fechaHoraLima } from "@/lib/fechas";
import { BotonImprimir } from "@/components/crm/boton-imprimir";
import { TituloParaImprimir } from "@/components/crm/titulo-para-imprimir";
import { MembreteDocumento } from "@/components/crm/membrete-documento";

export const dynamic = "force-dynamic";

/**
 * LA ORDEN DE POSTVENTA, PARA IMPRIMIR O GUARDAR EN PDF (25-09).
 *
 * Lesly: «no hay opción para imprimirlo; debería haber opción para guardar
 * PDF o exportar en PDF y poder imprimirlo». La apertura solo tenía hoja
 * imprimible para el cliente, y recién cuando postventa revisaba el informe;
 * la orden que va al almacén y al técnico (el formato de llamada) no se podía
 * sacar en papel. Es la misma orden que se ve en la apertura, con el membrete
 * de la empresa del cierre y un espacio para las firmas de la visita.
 */
export default async function OrdenAperturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase.from("aperturas_llamada").select("*, cuentas(razon_social, num_doc)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const a = data as unknown as AperturaLlamada & { cuentas: { razon_social: string; num_doc: string | null } | null };
  const cliente = a.cuentas?.razon_social ?? "—";
  const formato = (a.formato ?? null) as FormatoLlamada | null;

  const ids = [a.solicitada_por].filter(Boolean) as string[];
  const { data: gente } = ids.length ? await supabase.from("perfiles").select("id, nombre").in("id", ids) : { data: [] };
  const envio = ((gente ?? []) as { id: string; nombre: string }[]).find((g) => g.id === a.solicitada_por)?.nombre ?? null;

  // La misma regla de empresa que la hoja para el cliente: la del cierre del pedido, o la del último cierre del cliente.
  let serieEmpresa: "EFAMEINSA" | "OPEN" | null = null;
  if (a.servicio_id) {
    const { data: s } = await supabase.from("servicios_postventa").select("informes_cierre!servicios_postventa_informe_cierre_id_fkey(serie)").eq("id", a.servicio_id).maybeSingle();
    serieEmpresa = ((s?.informes_cierre as unknown as { serie: string } | null)?.serie as "EFAMEINSA" | "OPEN" | undefined) ?? null;
  }
  if (!serieEmpresa) {
    const { data: ult } = await supabase.from("informes_cierre").select("serie").eq("cuenta_id", a.cuenta_id).is("anulado_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    serieEmpresa = (ult?.serie as "EFAMEINSA" | "OPEN" | undefined) ?? null;
  }

  const titulo = `ORDEN DE POSTVENTA · ${ETIQUETA_TIPO_APERTURA[a.tipo].toUpperCase()}`;
  const cabecera: [string, string | null][] = [
    ["Cliente", cliente],
    ["RUC / DNI", a.cuentas?.num_doc ?? null],
    ["Programada para", fechaHoraLima(a.programada_para)],
    ["Contacto", a.contacto],
    ["Técnico a cargo", a.tecnico ?? "Sin asignar"],
    ["La envió", envio ? `${envio} · ${fechaHoraLima(a.solicitada_at)}` : null],
  ];
  const filasFormato = formato
    ? FILAS_FORMATO.map((f) => [f.etiqueta, f.clave === "problema" ? problemaConEquipo(formato) : formato[f.clave]] as [string, string | null | undefined]).filter(([, v]) => v)
    : [];

  return (
    <div className="hoja-informe mx-auto max-w-3xl bg-white p-8 text-[12.5px] leading-snug text-black">
      <div className="no-imprimir mb-4 flex items-center justify-between gap-3">
        <a href={`/aperturas/${id}`} className="text-xs text-muted-foreground hover:underline">
          ← Volver a la apertura
        </a>
        <TituloParaImprimir titulo={`Orden de postventa - ${cliente}`.replace(/[^\w\s.\-áéíóúñÁÉÍÓÚÑ]/g, "")} />
        <BotonImprimir>Imprimir / guardar PDF</BotonImprimir>
      </div>

      <MembreteDocumento serie={serieEmpresa} area="Postventa" />

      <h1 className="text-center text-base font-bold uppercase">{titulo}</h1>
      {a.urgente && <p className="mt-1 text-center text-[11px] font-bold uppercase">Urgente · sin pedido</p>}

      <table className="mt-3 w-full border-collapse text-[12px]">
        <tbody>
          {cabecera
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <tr key={k}>
                <th className="w-48 border border-neutral-500 bg-neutral-100 px-2 py-0.5 text-left font-semibold">{k}:</th>
                <td className="border border-neutral-500 px-2 py-0.5">{v}</td>
              </tr>
            ))}
        </tbody>
      </table>

      {filasFormato.length > 0 && (
        <>
          <p className="mt-4 font-bold">Formato de llamada:</p>
          <table className="mt-1 w-full border-collapse text-[12px]">
            <tbody>
              {filasFormato.map(([k, v]) => (
                <tr key={k}>
                  <th className="w-48 border border-neutral-500 bg-neutral-100 px-2 py-0.5 text-left align-top text-[11px] font-semibold uppercase">{k}</th>
                  <td className="whitespace-pre-wrap border border-neutral-500 px-2 py-0.5">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <section className="mt-4">
        <p className="font-bold">Equipos:</p>
        <p className="whitespace-pre-wrap">{a.equipos}</p>
      </section>
      {/* Solo si agrega algo: casi siempre es el mismo texto del «Problema». */}
      {a.indicaciones && a.indicaciones.trim() !== (formato?.problema ?? "").trim() && (
        <section className="mt-3">
          <p className="font-bold">Qué hay que revisar:</p>
          <p className="whitespace-pre-wrap">{a.indicaciones}</p>
        </section>
      )}

      {/* En papel, la orden viaja con el técnico: al pie firman él y quien lo recibe. */}
      <section className="mt-4">
        <p className="font-bold">Observaciones de la visita:</p>
        <div className="mt-1 h-20 border border-neutral-500" />
      </section>
      <div className="mt-10 grid grid-cols-2 gap-10 text-center text-[12px]">
        <div className="border-t border-neutral-700 pt-1">Firma del técnico</div>
        <div className="border-t border-neutral-700 pt-1">Conformidad del cliente (nombre y DNI)</div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          /* Fuera todo lo que no es la hoja, y sin la altura de la pantalla de
             atrás: con «visibility: hidden» seguía ocupando lugar y salía una
             segunda página en blanco (25-09). */
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
