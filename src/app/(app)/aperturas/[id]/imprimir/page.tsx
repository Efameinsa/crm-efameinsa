import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { MOTIVO_APERTURA, numeroInforme, tituloHojaApertura, type AperturaLlamada } from "@/lib/aperturas-llamada";
import { BotonImprimir } from "@/components/crm/boton-imprimir";
import { TituloParaImprimir } from "@/components/crm/titulo-para-imprimir";
import { MembreteDocumento } from "@/components/crm/membrete-documento";
import { SelectorMembrete, empresaDeLaDireccion } from "@/components/crm/selector-membrete";
import { conDni, relacionDeTecnicos } from "@/lib/tecnicos";

export const dynamic = "force-dynamic";

const fechaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima" }) : "—");
const horaCorta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * LA HOJA PARA EL CLIENTE (versión 2 de la apertura, 0281).
 *
 * Sale la versión que revisó postventa —nunca la del almacén tal cual:
 * «no se le envía directamente al cliente, pasa por una revisión» (23-09)—,
 * con el mismo membrete que el informe técnico. Se imprime o se guarda como
 * PDF desde el navegador.
 */
export default async function ImprimirAperturaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ empresa?: string | string[] }>;
}) {
  const { id } = await params;
  const elegida = empresaDeLaDireccion((await searchParams).empresa);
  await requerirPerfil();
  const supabase = await createClient();
  const [{ data }, relacion] = await Promise.all([ supabase.from("aperturas_llamada").select("*, cuentas(razon_social, num_doc)").eq("id", id).maybeSingle(),
    relacionDeTecnicos(supabase),
  ]);
  if (!data || !data.informe_cliente) notFound();
  const a = data as unknown as AperturaLlamada & { cuentas: { razon_social: string; num_doc: string | null } | null };
  const fotos = a.informe_fotos ?? [];
  const { data: firmadas } = fotos.length
    ? await supabase.storage.from("adjuntos").createSignedUrls(fotos.map((f) => f.path), 3600)
    : { data: null };
  const urls = (firmadas ?? []).map((f) => f.signedUrl).filter(Boolean) as string[];
  const cliente = a.cuentas?.razon_social ?? "—";
  let serieEmpresa: "EFAMEINSA" | "OPEN" | null = null;
  if (a.servicio_id) {
    const { data: s } = await supabase.from("servicios_postventa").select("informes_cierre!servicios_postventa_informe_cierre_id_fkey(serie)").eq("id", a.servicio_id).maybeSingle();
    serieEmpresa = ((s?.informes_cierre as unknown as { serie: string } | null)?.serie as "EFAMEINSA" | "OPEN" | undefined) ?? null;
  }
  if (!serieEmpresa) {
    const { data: ult } = await supabase.from("informes_cierre").select("serie").eq("cuenta_id", a.cuenta_id).is("anulado_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    serieEmpresa = (ult?.serie as "EFAMEINSA" | "OPEN" | undefined) ?? null;
  }
  // EL MISMO NÚMERO QUE EL INFORME DEL ALMACÉN (reunión 28-09 14:18): «todos
  // los registros documentarios tienen que tener un código… este detalle
  // tiene que tener el mismo número de correlativo del informe de almacén».
  // La hoja para el cliente es la versión revisada de ese informe, no otro.
  const { data: inf } = a.informe_servicio_id
    ? await supabase.from("informes_servicio").select("correlativo, anio, es_prueba").eq("id", a.informe_servicio_id).maybeSingle()
    : { data: null };
  const n = numeroInforme(inf as { correlativo: number | null; anio: number | null; es_prueba: boolean | null } | null);
  const numero = n ? `Informe N.º ${n}` : null;
  // «Solamente debería ser informe de videollamada»: el tipo va como motivo.
  const titulo = tituloHojaApertura(a.tipo);
  // El motivo va en el cuerpo como fila. El «problema» que escribió postventa
  // para el almacén NO se imprime: es interno (trae notas como «la cliente es
  // un poco especial…») y la hoja es la versión revisada para el cliente.
  const filas: [string, string | null][] = [
    ["Cliente", cliente],
    ["RUC / DNI", a.cuentas?.num_doc ?? null],
    ["Motivo", MOTIVO_APERTURA[a.tipo]],
    ["Fecha de ejecución", fechaCorta(a.programada_para)],
    ["Hora", horaCorta(a.programada_para)],
    ["Técnico a cargo", conDni(a.tecnico, relacion)],
    ["Fecha de informe", fechaCorta(a.revisada_at)],
  ];

  return (
    <div className="hoja-informe mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed text-black">
      <div className="no-imprimir mb-4 flex items-center justify-between gap-3">
        <a href={`/aperturas/${id}`} className="text-xs text-muted-foreground hover:underline">
          ← Volver a la apertura
        </a>
        <TituloParaImprimir titulo={`${titulo}${n ? ` ${n}` : ""} - ${cliente}`.replace(/[^\w\s.\-áéíóúñÁÉÍÓÚÑ]/g, "")} />
        <SelectorMembrete base={`/aperturas/${id}/imprimir`} actual={elegida ?? serieEmpresa ?? "EFAMEINSA"} deducida={serieEmpresa} />
        <BotonImprimir>Imprimir / guardar PDF</BotonImprimir>
      </div>

      {/* La empresa del cierre del pedido; si no hay pedido, la del último cierre del cliente (Santos, 24-09). */}
      <MembreteDocumento serie={elegida ?? serieEmpresa} area="Postventa" numero={numero} />

      <h1 className="text-center text-base font-bold uppercase">{titulo}</h1>

      <table className="mt-3 w-full border-collapse text-[12px]">
        <tbody>
          {filas
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <tr key={k}>
                <th className="w-48 border border-neutral-500 bg-neutral-100 px-2 py-1 text-left font-semibold">{k}:</th>
                <td className="border border-neutral-500 px-2 py-1">{v}</td>
              </tr>
            ))}
        </tbody>
      </table>

      <section className="mt-3">
        <p className="font-bold">Equipos:</p>
        <p className="whitespace-pre-wrap">{a.equipos}</p>
      </section>
      <section className="mt-3">
        <p className="font-bold">Resultado:</p>
        <p className="whitespace-pre-wrap">{a.informe_cliente}</p>
      </section>

      {urls.length > 0 && (
        <section className="mt-4">
          <p className="font-bold">Registro fotográfico:</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {urls.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={u} alt={`Foto ${i + 1}`} className="max-h-72 w-full rounded border border-neutral-300 object-contain" />
            ))}
          </div>
        </section>
      )}

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
          img { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
