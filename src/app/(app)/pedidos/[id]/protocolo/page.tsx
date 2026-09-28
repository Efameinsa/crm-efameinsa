import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { MembreteDocumento } from "@/components/crm/membrete-documento";
import { BotonImprimir } from "@/components/crm/boton-imprimir";
import { TituloParaImprimir } from "@/components/crm/titulo-para-imprimir";

export const dynamic = "force-dynamic";

type Archivo = { path: string; nombre?: string | null; tipo?: string | null; etiqueta?: string | null } | null;

const fechaHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const esImagen = (a: { path: string; tipo?: string | null }) => (a.tipo ?? "").startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(a.path);

/**
 * EL INFORME DE PRUEBA Y EMBALAJE DEL PEDIDO (reunión 28-09 14:18).
 *
 * Carlos, con el pedido abierto: «¿dónde está el informe de prueba y
 * embalaje? O sea, del protocolo… que tenga todos los informes, y cuando le dé
 * clic, abra el informe de detalle… no vas a depender del almacén». El almacén
 * sube el protocolo máquina por máquina (0260: fotos, el PDF firmado, su N.º);
 * hasta hoy solo se veía como fotos sueltas en la galería del pedido. Acá está
 * como documento: qué se probó, cuándo, quién, con qué N.º de protocolo, y sus
 * archivos. Se imprime o se guarda como PDF desde el navegador.
 */
export default async function ProtocoloDelPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requerirPerfil();
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("servicios_postventa")
    .select(
      "id, cliente_texto, numero_pedido_erp, prueba_embalaje, prueba_solicitada_at, prueba_lista_at, prueba_lista_por, protocolo_prueba_ref, protocolo_fotos, informes_cierre!servicios_postventa_informe_cierre_id_fkey(codigo, serie)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!s) notFound();
  const { data: equiposData } = await supabase
    .from("pedido_equipos")
    .select("id, orden, descripcion, serie, prueba_lista_at, prueba_lista_por, protocolo_ref, protocolo_nota, protocolo_fotos")
    .eq("servicio_id", id)
    .order("orden");
  const equipos = (equiposData ?? []) as {
    id: string;
    orden: number;
    descripcion: string;
    serie: string | null;
    prueba_lista_at: string | null;
    prueba_lista_por: string | null;
    protocolo_ref: string | null;
    protocolo_nota: string | null;
    protocolo_fotos: Archivo[] | null;
  }[];
  const cierre = s.informes_cierre as unknown as { codigo: string | null; serie: string | null } | null;

  // Los archivos: los de cada máquina y, en los pedidos anteriores a la 0260, los del pedido.
  const deEquipos = equipos.flatMap((e) => (e.protocolo_fotos ?? []).filter((f): f is NonNullable<Archivo> => Boolean(f?.path)).map((f) => ({ ...f, equipo: e.id })));
  const delPedido = ((s.protocolo_fotos ?? []) as Archivo[])
    .filter((f): f is NonNullable<Archivo> => Boolean(f?.path))
    .filter((f) => !deEquipos.some((x) => x.path === f.path))
    .map((f) => ({ ...f, equipo: null as string | null }));
  const archivos = [...deEquipos, ...delPedido];
  const { data: firmadas } = archivos.length
    ? await supabase.storage.from("adjuntos").createSignedUrls(archivos.map((a) => a.path), 3600)
    : { data: null };
  const url = (i: number) => firmadas?.[i]?.signedUrl ?? null;

  const ids = [...new Set([s.prueba_lista_por, ...equipos.map((e) => e.prueba_lista_por)].filter(Boolean) as string[])];
  const { data: gente } = ids.length ? await supabase.from("perfiles").select("id, nombre").in("id", ids) : { data: [] };
  const nombre = (x: string | null) => (x ? ((gente ?? []) as { id: string; nombre: string }[]).find((g) => g.id === x)?.nombre ?? null : null);

  const refs = [...new Set([s.protocolo_prueba_ref, ...equipos.map((e) => e.protocolo_ref)].map((r) => r?.trim()).filter(Boolean) as string[])];
  const numero = refs.length ? `Protocolo N.º ${refs.join(" / ")}` : null;
  const cliente = (s.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  const titulo = "INFORME DE PRUEBA Y EMBALAJE";
  const filas: [string, string | null][] = [
    ["Cliente", cliente],
    ["Pedido", s.numero_pedido_erp ?? null],
    ["Cierre de venta", cierre?.codigo ? `N.º ${cierre.codigo}` : null],
    ["Prueba solicitada", s.prueba_solicitada_at ? fechaHora(s.prueba_solicitada_at) : null],
    ["Probado y embalado", s.prueba_lista_at ? `${fechaHora(s.prueba_lista_at)}${nombre(s.prueba_lista_por) ? ` · ${nombre(s.prueba_lista_por)}` : ""}` : "Todavía no"],
  ];

  return (
    <div className="hoja-informe mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed text-black">
      <div className="no-imprimir mb-4 flex items-center justify-between gap-3">
        <a href={`/postventa/pedidos/${id}`} className="text-xs text-muted-foreground hover:underline">
          ← Volver al pedido
        </a>
        <TituloParaImprimir titulo={`${titulo}${refs.length ? ` ${refs.join(" ")}` : ""} - ${cliente}`.replace(/[^\w\s.\-áéíóúñÁÉÍÓÚÑ]/g, "")} />
        <BotonImprimir>Imprimir / guardar PDF</BotonImprimir>
      </div>

      <MembreteDocumento serie={cierre?.serie === "OPEN" ? "OPEN" : "EFAMEINSA"} area="Almacén" numero={numero} />

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

      {equipos.length > 0 && (
        <section className="mt-4">
          <p className="font-bold">Equipos probados:</p>
          <table className="mt-1 w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {["#", "Equipo", "Serie", "N.º protocolo", "Probado"].map((h) => (
                  <th key={h} className="border border-neutral-500 bg-neutral-100 px-2 py-1 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {equipos.map((e, k) => (
                <tr key={e.id}>
                  <td className="w-8 border border-neutral-500 px-2 py-1 align-top">{k + 1}</td>
                  <td className="whitespace-pre-line border border-neutral-500 px-2 py-1">
                    {e.descripcion}
                    {e.protocolo_nota && <span className="mt-1 block text-[11px] italic">Nota: {e.protocolo_nota}</span>}
                  </td>
                  <td className="w-32 border border-neutral-500 px-2 py-1 align-top font-mono">{e.serie ?? "—"}</td>
                  <td className="w-24 border border-neutral-500 px-2 py-1 align-top">{e.protocolo_ref ?? "—"}</td>
                  <td className="w-36 border border-neutral-500 px-2 py-1 align-top">
                    {e.prueba_lista_at ? `${fechaHora(e.prueba_lista_at)}${nombre(e.prueba_lista_por) ? ` · ${nombre(e.prueba_lista_por)}` : ""}` : "Pendiente"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {archivos.some((a) => !esImagen(a)) && (
        <section className="mt-4">
          <p className="font-bold">Protocolo y documentos adjuntos:</p>
          <ul className="ml-5 list-disc">
            {archivos.map((a, i) =>
              esImagen(a) ? null : (
                <li key={a.path}>
                  <a href={url(i) ?? "#"} target="_blank" rel="noreferrer" className="text-[#8B1510] underline">
                    {a.nombre ?? a.path.split("/").pop()}
                  </a>
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      {archivos.some((a) => esImagen(a)) && (
        <section className="mt-4">
          <p className="font-bold">Registro fotográfico:</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {archivos.map((a, i) =>
              esImagen(a) && url(i) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={a.path} src={url(i)!} alt={a.nombre ?? `Foto ${i + 1}`} className="max-h-72 w-full rounded border border-neutral-300 object-contain" />
              ) : null,
            )}
          </div>
        </section>
      )}

      {archivos.length === 0 && (
        <p className="mt-4 text-[12px] italic text-neutral-600">
          {s.prueba_lista_at
            ? "El almacén marcó la prueba y el embalaje sin subir el protocolo ni fotos."
            : "El almacén todavía no probó ni embaló este pedido."}
        </p>
      )}

      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
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
