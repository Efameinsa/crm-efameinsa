import { notFound } from "next/navigation";
import Link from "@/components/enlace";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { MembreteDocumento } from "@/components/crm/membrete-documento";
import { BotonImprimir } from "@/components/crm/boton-imprimir";
import { TituloParaImprimir } from "@/components/crm/titulo-para-imprimir";
import { DatosHojaProtocolo } from "@/components/crm/datos-hoja-protocolo";
import { HojaChequeoProtocolo } from "@/components/crm/hoja-chequeo-protocolo";
import { PanelProtocoloDeStock } from "@/components/crm/protocolo-stock";
import { cabeceraDeLaDescripcion, chequeoVacio, plantillaPara, type Chequeo } from "@/lib/protocolo-checklist";
import { fechaCorta, fechaLarga, propuestaDeHoja, type DatosHoja } from "@/lib/protocolo-hoja";
import { fechaLima } from "@/lib/fechas";

export const dynamic = "force-dynamic";

type Archivo = { path: string; nombre?: string | null; tipo?: string | null; etiqueta?: string | null };

const esImagen = (a: Archivo) => (a.tipo ?? "").startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(a.path);
const esVideo = (a: Archivo) => (a.tipo ?? "").startsWith("video/") || /\.(mp4|mov|webm|3gp)$/i.test(a.path);
const diaLima = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" }) : undefined);

/** Quien mira la hoja de un equipo en stock no tiene cliente todavía. */
const CLIENTE = "STOCK DEL ALMACÉN";

/**
 * EL INFORME DE PROTOCOLO DE UN EQUIPO EN STOCK (0474; Lesly, 14-10). La misma
 * hoja que el informe de prueba y embalaje del pedido (/pedidos/[id]/protocolo)
 * y la misma hoja de chequeo al final, para una máquina que todavía no tiene
 * pedido. Cuando pasa a un pedido, desde ahí se corrige.
 */
export default async function ProtocoloDeStockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requerirPerfil();
  const supabase = await createClient();
  const { data: v } = await supabase
    .from("protocolos_stock")
    .select("id, descripcion, serie, protocolo_ref, protocolo_nota, protocolo_fecha, protocolo_fotos, protocolo_datos, protocolo_chequeo, terminado_at, heredado_por, heredado_at, creado_por, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!v) notFound();

  const archivos = ((v.protocolo_fotos ?? []) as Archivo[]).filter((a) => a?.path);
  const { data: firmadas } = archivos.length ? await supabase.storage.from("adjuntos").createSignedUrls(archivos.map((a) => a.path), 3600) : { data: null };
  const url = (i: number) => firmadas?.[i]?.signedUrl ?? null;

  const [{ data: autor }, { data: falta }, { data: pedido }] = await Promise.all([
    v.creado_por ? supabase.from("perfiles").select("nombre").eq("id", v.creado_por).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc("protocolo_stock_falta", { p_id: id }),
    v.heredado_por
      ? supabase.from("pedido_equipos").select("servicio_id, servicios_postventa(cliente_texto)").eq("id", v.heredado_por).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const deDonde = pedido as unknown as { servicio_id: string; servicios_postventa: { cliente_texto: string | null } | null } | null;
  const editable = !v.heredado_por;

  const guardado = ((v.protocolo_datos ?? {}) as Record<string, DatosHoja>).principal ?? {};
  const propuesta = propuestaDeHoja({ descripcion: v.descripcion, serie: v.serie, parte_nombre: null }, "principal");
  const hoy = diaLima(new Date().toISOString())!;
  const datos: DatosHoja = {
    equipo: guardado.equipo ?? propuesta.equipo,
    modelo: guardado.modelo ?? propuesta.modelo,
    serie: guardado.serie ?? v.serie,
    fecha_ejecucion: guardado.fecha_ejecucion ?? v.protocolo_fecha ?? undefined,
    fecha_informe: guardado.fecha_informe ?? diaLima(v.terminado_at) ?? hoy,
    tecnico: guardado.tecnico,
    elaborado: guardado.elaborado ?? (autor as { nombre: string } | null)?.nombre ?? undefined,
  };
  const faltanHoja = [!guardado.modelo && "modelo de la placa", !datos.fecha_ejecucion && "fecha de ejecución", !datos.tecnico && "técnico a cargo", !datos.elaborado && "quién elaboró"].filter(
    Boolean,
  ) as string[];
  const modelo = [datos.modelo, datos.serie].filter(Boolean).join(" /");
  const filas: [string, string | null | undefined][] = [
    ["Cliente", "Stock del almacén"],
    ["Asunto", "Protocolo de Prueba"],
    ["Fecha de Ejecución", fechaCorta(datos.fecha_ejecucion)],
    ["Fecha de Informe", fechaCorta(datos.fecha_informe)],
    ["Técnico a Cargo", datos.tecnico],
    ["Elaboración de informe", datos.elaborado],
  ];
  const docs = archivos.map((a, i) => i).filter((i) => !esImagen(archivos[i]) && !esVideo(archivos[i]));
  const videos = archivos.map((a, i) => i).filter((i) => esVideo(archivos[i]));
  const fotos = archivos.map((a, i) => i).filter((i) => esImagen(archivos[i]) && url(i));

  const plantilla = plantillaPara(datos.equipo);
  const chequeoGuardado = ((v.protocolo_chequeo ?? {}) as Record<string, Chequeo & { guardado_at?: string }>).principal;
  const capacidad = (datos.equipo ?? "").match(/(\d+(?:\.\d+)?)\s*(KG|LB)(?![A-Z])/i);
  const inicial: Chequeo | null = plantilla
    ? chequeoGuardado?.plantilla
      ? { ...chequeoVacio(plantilla.clave), ...chequeoGuardado }
      : {
          ...chequeoVacio(plantilla.clave),
          datos: {
            ...cabeceraDeLaDescripcion(v.descripcion),
            ...(capacidad ? { capacidad: `${capacidad[1]} ${capacidad[2].toUpperCase() === "KG" ? "Kg" : "Lb"}` } : {}),
            ...(datos.tecnico ? { tecnico_electricista: datos.tecnico } : {}),
          },
        }
    : null;

  return (
    <div className="hoja-informe mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed text-black">
      <div className="no-imprimir mb-4 flex items-center justify-between gap-3">
        <Link href="/almacen/protocolos" className="text-xs text-muted-foreground hover:underline">
          ← Volver a los protocolos
        </Link>
        <TituloParaImprimir titulo={`INFORME DE PROTOCOLO DE PRUEBA${v.protocolo_ref ? ` ${v.protocolo_ref}` : ""} - STOCK ${v.serie}`.replace(/[^\w\s.\-áéíóúñÁÉÍÓÚÑ]/g, "")} />
        <BotonImprimir>Imprimir / guardar PDF</BotonImprimir>
      </div>

      {deDonde ? (
        <p className="no-imprimir mb-3 rounded border border-[#1E7F4F]/40 bg-[#1E7F4F]/5 px-3 py-2 text-[12px] text-[#1E7F4F]">
          ✓ Pasó al pedido de <b>{(deDonde.servicios_postventa?.cliente_texto ?? "un cliente").replace(/^\d{8,11}\s*-\s*/, "")}</b>
          {v.heredado_at ? ` el ${fechaLima(v.heredado_at)}` : ""}. Desde ahí se corrige:{" "}
          <a href={`/pedidos/${deDonde.servicio_id}/protocolo`} className="font-semibold underline">
            abrir el informe del pedido
          </a>
          .
        </p>
      ) : v.terminado_at ? (
        <p className="no-imprimir mb-3 rounded border border-[#1E7F4F]/40 bg-[#1E7F4F]/5 px-3 py-2 text-[12px] text-[#1E7F4F]">
          ✓ Terminado el {fechaLima(v.terminado_at)}. Cuando la serie {v.serie} salga en un pedido, este protocolo pasa solo a esa máquina.
        </p>
      ) : (
        <p className="mb-2 rounded border-2 border-dashed border-amber-500 bg-amber-50 px-3 py-1.5 text-center text-[12px] font-bold uppercase tracking-wide text-amber-800">
          Borrador · equipo en stock, falta darlo por terminado
        </p>
      )}

      {editable && (
        <PanelProtocoloDeStock id={id} protocoloRef={v.protocolo_ref} nota={v.protocolo_nota} falta={(falta ?? []) as string[]} terminado={Boolean(v.terminado_at)} />
      )}

      <section>
        <MembreteDocumento serie="EFAMEINSA" area="Almacén" numero={v.protocolo_ref ? `Protocolo N.º ${v.protocolo_ref}` : null} />
        <p className="text-right text-[12px] italic">{fechaLarga(datos.fecha_informe ?? hoy)}</p>
        <h1 className="mt-4 text-center text-[15px] font-bold uppercase underline">INFORME DE PROTOCOLO DE PRUEBA DE {datos.equipo}</h1>
        {modelo && <p className="mt-1 text-center text-[14px] font-bold uppercase underline">MODELO: {modelo}</p>}
        <div className="mt-4 border-y border-black py-2 text-[13px]">
          {filas.map(([k, x]) => (
            <p key={k}>
              <b>{k}:</b> {x ?? ""}
            </p>
          ))}
        </div>

        {editable && <DatosHojaProtocolo itemId={id} servicioId="" stockId={id} maquina="principal" valores={datos} faltan={faltanHoja} />}

        {v.protocolo_nota && (
          <p className="mt-3 text-[12px]">
            <b>Nota:</b> {v.protocolo_nota}
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

        {videos.length > 0 && (
          <div className="mt-3 text-[12px]">
            <p className="font-semibold">Video de la prueba:</p>
            <div className="no-imprimir mt-1.5 grid grid-cols-2 gap-3">
              {videos.map((i) => (url(i) ? <video key={archivos[i].path} src={url(i)!} controls preload="metadata" className="h-64 w-full bg-black object-contain" /> : null))}
            </div>
            <ul className="ml-5 hidden list-disc print:block">
              {videos.map((i) => (
                <li key={archivos[i].path}>{archivos[i].nombre ?? archivos[i].path.split("/").pop()} (en el CRM)</li>
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
          <p className="no-imprimir mt-4 text-[12px] italic text-neutral-600">Todavía no hay fotos: se suben arriba.</p>
        )}
      </section>

      {plantilla && inicial && (
        <HojaChequeoProtocolo
          itemId={id}
          servicioId=""
          stockId={id}
          maquina="principal"
          plantilla={plantilla}
          fijos={{ cliente: CLIENTE, modelo: datos.modelo, serie: datos.serie, fecha: datos.fecha_ejecucion, protocolo: v.protocolo_ref }}
          inicial={inicial}
          hoja={datos}
          editable={editable}
          guardadoAt={chequeoGuardado?.guardado_at ?? null}
        />
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
