import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { MembreteDocumento } from "@/components/crm/membrete-documento";
import { BotonImprimir } from "@/components/crm/boton-imprimir";
import { TituloParaImprimir } from "@/components/crm/titulo-para-imprimir";
import { DatosHojaProtocolo } from "@/components/crm/datos-hoja-protocolo";
import { esTorre } from "@/lib/torres";
import { fechaCorta, fechaLarga, propuestaDeHoja, type DatosHoja, type Maquina } from "@/lib/protocolo-hoja";

export const dynamic = "force-dynamic";

type Archivo = { path: string; nombre?: string | null; tipo?: string | null; etiqueta?: string | null } | null;

const esImagen = (a: { path: string; tipo?: string | null }) => (a.tipo ?? "").startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(a.path);
const diaLima = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) : undefined);

/**
 * EL INFORME DE PROTOCOLO DE PRUEBA DEL PEDIDO (reunión 28-09 14:18).
 *
 * Carlos, con el pedido abierto: «¿dónde está el informe de prueba y
 * embalaje? O sea, del protocolo… que tenga todos los informes, y cuando le dé
 * clic, abra el informe de detalle… no vas a depender del almacén». El almacén
 * sube el protocolo máquina por máquina (0260: fotos, el PDF firmado, su N.º).
 *
 * UNA HOJA POR MÁQUINA, COMO EL MODELO (0417; Ariana, 07-10: «que mantenga el
 * formato, la estructura y la información establecida según el modelo»). El
 * Word de siempre («formato de protocolo Lavadora …»): la fecha arriba a la
 * derecha, «INFORME DE PROTOCOLO DE PRUEBA DE LAVADORA 13 KG», «MODELO:
 * CWG27MDCRS /405KWATM5344», cliente, asunto, fechas de ejecución y de
 * informe, técnico a cargo, quién lo elaboró y las fotos de dos en dos. La
 * torre sin renglón de secadora da dos hojas. Se imprime o se guarda como PDF
 * desde el navegador, cada hoja en su página.
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
    .select("id, orden, descripcion, serie, prueba_lista_at, prueba_lista_por, protocolo_ref, protocolo_nota, protocolo_fotos, protocolo_fecha, protocolo_datos, parte_de, parte_nombre")
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
    protocolo_fecha: string | null;
    protocolo_datos: Record<string, DatosHoja> | null;
    parte_de: string | null;
    parte_nombre: string | null;
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

  // Quién puede completar la hoja: los mismos que suben sus archivos (0416, 0417).
  const permisos = await Promise.all(["es_almacen", "puede_postventa", "es_backoffice", "es_operaciones"].map((f) => supabase.rpc(f)));
  const puedeEditar = permisos.some((r) => r.data === true);
  // Borrador: alguna máquina sin marcar como probada (Ariana, 07-10: revisar el informe antes de finalizar).
  const borrador = equipos.length > 0 ? equipos.some((e) => !e.prueba_lista_at) : !s.prueba_lista_at;
  const hoy = diaLima(new Date().toISOString())!;
  const cliente = (s.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  const serieEmpresa = cierre?.serie === "OPEN" ? "OPEN" : "EFAMEINSA";

  // Las hojas: lo que el almacén completó (0417) y, si no, lo que se lee del pedido.
  type Hoja = { clave: string; item: (typeof equipos)[number] | null; maquina: Maquina; datos: DatosHoja; faltan: string[]; indices: number[] };
  const hojas: Hoja[] = [];
  const armar = (e: (typeof equipos)[number], maquina: Maquina, indices: number[]) => {
    const guardado = (e.protocolo_datos ?? {})[maquina] ?? {};
    const propuesta = propuestaDeHoja(e, maquina);
    const ejecucion = guardado.fecha_ejecucion ?? e.protocolo_fecha ?? diaLima(e.prueba_lista_at);
    const datos: DatosHoja = {
      equipo: guardado.equipo ?? propuesta.equipo,
      modelo: guardado.modelo ?? propuesta.modelo,
      serie: guardado.serie ?? propuesta.serie,
      fecha_ejecucion: ejecucion,
      fecha_informe: guardado.fecha_informe ?? diaLima(e.prueba_lista_at) ?? hoy,
      tecnico: guardado.tecnico,
      elaborado: guardado.elaborado ?? nombre(e.prueba_lista_por) ?? undefined,
    };
    const faltan = [
      !guardado.modelo && "modelo de la placa",
      !datos.serie && "serie",
      !ejecucion && "fecha de ejecución",
      !datos.tecnico && "técnico a cargo",
      !datos.elaborado && "quién elaboró",
    ].filter(Boolean) as string[];
    hojas.push({ clave: `${e.id}-${maquina}`, item: e, maquina, datos, faltan, indices });
  };
  equipos.forEach((e) => {
    const propios = archivos.map((a, i) => (a.equipo === e.id ? i : -1)).filter((i) => i >= 0);
    // La secadora de una torre sin renglón propio sube con el sufijo «-secadora» (35cef069).
    const deSecadora = propios.filter((i) => /-secadora-/.test(archivos[i].path));
    armar(e, "principal", propios.filter((i) => !deSecadora.includes(i)));
    const tieneParte = equipos.some((p) => p.parte_de === e.id);
    if (deSecadora.length > 0 || (!e.parte_de && !tieneParte && esTorre(e.descripcion ?? ""))) armar(e, "secadora", deSecadora);
  });
  const sueltos = archivos.map((a, i) => (a.equipo ? -1 : i)).filter((i) => i >= 0);
  // Los pedidos anteriores a la 0260 no tienen máquinas: una sola hoja con lo del pedido.
  if (hojas.length === 0)
    hojas.push({
      clave: "pedido",
      item: null,
      maquina: "principal",
      datos: {
        equipo: "EQUIPO",
        fecha_ejecucion: diaLima(s.prueba_lista_at),
        fecha_informe: diaLima(s.prueba_lista_at) ?? hoy,
        elaborado: nombre(s.prueba_lista_por) ?? undefined,
      },
      faltan: [],
      indices: sueltos,
    });
  else if (sueltos.length > 0) hojas[hojas.length - 1].indices.push(...sueltos);

  const refs = [...new Set([s.protocolo_prueba_ref, ...equipos.map((e) => e.protocolo_ref)].map((r) => r?.trim()).filter(Boolean) as string[])];
  const titulo = "INFORME DE PROTOCOLO DE PRUEBA";

  return (
    <div className="hoja-informe mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed text-black">
      <div className="no-imprimir mb-4 flex items-center justify-between gap-3">
        <a href={`/postventa/pedidos/${id}`} className="text-xs text-muted-foreground hover:underline">
          ← Volver al pedido
        </a>
        <TituloParaImprimir titulo={`${titulo}${refs.length ? ` ${refs.join(" ")}` : ""} - ${cliente}`.replace(/[^\w\s.\-áéíóúñÁÉÍÓÚÑ]/g, "")} />
        <BotonImprimir>Imprimir / guardar PDF</BotonImprimir>
      </div>

      {borrador && (
        <p className="mb-2 rounded border-2 border-dashed border-amber-500 bg-amber-50 px-3 py-1.5 text-center text-[12px] font-bold uppercase tracking-wide text-amber-800">
          Borrador · falta marcar {equipos.filter((e) => !e.prueba_lista_at).length > 1 ? "las máquinas" : "la máquina"} como probada y embalada
        </p>
      )}
      {hojas.length > 1 && (
        <p className="no-imprimir mb-3 text-[11px] text-neutral-600">
          {hojas.length} hojas, una por máquina, como el formato de protocolo de siempre. Al imprimir, cada una sale en su página.
        </p>
      )}

      {hojas.map((h, n) => {
        const e = h.item;
        const docs = h.indices.filter((i) => !esImagen(archivos[i]));
        const fotos = h.indices.filter((i) => esImagen(archivos[i]) && url(i));
        const modelo = [h.datos.modelo, h.datos.serie].filter(Boolean).join(" /");
        const filas: [string, string | null | undefined][] = [
          ["Cliente", cliente],
          ["Asunto", "Protocolo de Prueba"],
          ["Fecha de Ejecución", fechaCorta(h.datos.fecha_ejecucion)],
          ["Fecha de Informe", fechaCorta(h.datos.fecha_informe)],
          ["Técnico a Cargo", h.datos.tecnico],
          ["Elaboración de informe", h.datos.elaborado],
        ];
        return (
          <section key={h.clave} className={n > 0 ? "mt-10 break-before-page border-t-2 border-dashed border-neutral-300 pt-8 print:mt-0 print:border-0 print:pt-0" : ""}>
            <MembreteDocumento serie={serieEmpresa} area="Almacén" numero={e?.protocolo_ref ? `Protocolo N.º ${e.protocolo_ref}` : null} />
            <p className="text-right text-[12px] italic">{fechaLarga(h.datos.fecha_informe ?? hoy)}</p>

            <h1 className="mt-4 text-center text-[15px] font-bold uppercase underline">INFORME DE PROTOCOLO DE PRUEBA DE {h.datos.equipo}</h1>
            {modelo && <p className="mt-1 text-center text-[14px] font-bold uppercase underline">MODELO: {modelo}</p>}

            <div className="mt-4 border-y border-black py-2 text-[13px]">
              {filas.map(([k, v]) => (
                <p key={k}>
                  <b>{k}:</b> {v ?? ""}
                </p>
              ))}
            </div>

            {e && puedeEditar && <DatosHojaProtocolo itemId={e.id} servicioId={id} maquina={h.maquina} valores={h.datos} faltan={h.faltan} />}

            {h.maquina === "principal" && e?.protocolo_nota && (
              <p className="mt-3 text-[12px]">
                <b>Nota:</b> {e.protocolo_nota}
              </p>
            )}

            {docs.length > 0 && (
              <div className="mt-3 text-[12px]">
                <p className="font-semibold">Protocolo y documentos:</p>
                <ul className="ml-5 list-disc">
                  {docs.map((i) => (
                    <li key={archivos[i].path}>
                      <a href={url(i) ?? "#"} target="_blank" rel="noreferrer" className="text-[#8B1510] underline">
                        {archivos[i].nombre ?? archivos[i].path.split("/").pop()}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {fotos.length > 0 ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {fotos.map((i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={archivos[i].path} src={url(i)!} alt={archivos[i].nombre ?? `Foto ${i + 1}`} className="h-80 w-full object-contain" />
                ))}
              </div>
            ) : (
              <p className="no-imprimir mt-4 text-[12px] italic text-neutral-600">
                {e?.prueba_lista_at || (!e && s.prueba_lista_at)
                  ? "Se marcó la prueba sin subir fotos de esta máquina."
                  : "Todavía no hay fotos de esta máquina: se suben desde el pedido del almacén."}
              </p>
            )}
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
          img { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
