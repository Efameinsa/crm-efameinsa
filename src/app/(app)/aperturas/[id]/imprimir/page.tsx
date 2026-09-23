import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { ETIQUETA_TIPO_APERTURA, type AperturaLlamada } from "@/lib/aperturas-llamada";
import { BotonImprimir } from "@/components/crm/boton-imprimir";
import { TituloParaImprimir } from "@/components/crm/titulo-para-imprimir";

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
export default async function ImprimirAperturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase.from("aperturas_llamada").select("*, cuentas(razon_social, num_doc)").eq("id", id).maybeSingle();
  if (!data || !data.informe_cliente) notFound();
  const a = data as unknown as AperturaLlamada & { cuentas: { razon_social: string; num_doc: string | null } | null };
  const fotos = a.informe_fotos ?? [];
  const { data: firmadas } = fotos.length
    ? await supabase.storage.from("adjuntos").createSignedUrls(fotos.map((f) => f.path), 3600)
    : { data: null };
  const urls = (firmadas ?? []).map((f) => f.signedUrl).filter(Boolean) as string[];
  const cliente = a.cuentas?.razon_social ?? "—";
  const titulo = `INFORME DE ${ETIQUETA_TIPO_APERTURA[a.tipo].toUpperCase()}`;
  const filas: [string, string | null][] = [
    ["Cliente", cliente],
    ["RUC / DNI", a.cuentas?.num_doc ?? null],
    ["Fecha de ejecución", fechaCorta(a.programada_para)],
    ["Hora", horaCorta(a.programada_para)],
    ["Técnico a cargo", a.tecnico],
    ["Fecha de informe", fechaCorta(a.revisada_at)],
  ];

  return (
    <div className="hoja-informe mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed text-black">
      <div className="no-imprimir mb-4 flex items-center justify-between gap-3">
        <a href={`/aperturas/${id}`} className="text-xs text-muted-foreground hover:underline">
          ← Volver a la apertura
        </a>
        <TituloParaImprimir titulo={`${titulo} - ${cliente}`.replace(/[^\w\s.\-áéíóúñÁÉÍÓÚÑ]/g, "")} />
        <BotonImprimir>Imprimir / guardar PDF</BotonImprimir>
      </div>

      <div className="mb-3 flex items-center justify-between border-b-2 border-[#8B1510] pb-2">
        <div>
          <p className="text-lg font-bold tracking-wide">EFAMEINSA</p>
          <p className="text-[11px] text-neutral-600">Corporación Efameinsa e Ingeniería S.A. · Postventa</p>
        </div>
        <p className="text-right text-[11px] text-neutral-600">www.efameinsa.com</p>
      </div>

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
          body * { visibility: hidden !important; }
          .hoja-informe, .hoja-informe * { visibility: visible !important; }
          .hoja-informe { position: absolute; inset: 0; max-width: none; padding: 0; margin: 0; }
          .no-imprimir { display: none !important; }
          img { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
