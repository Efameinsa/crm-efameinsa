import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { etiquetaTipoServicio } from "@/lib/postventa";
import { BotonImprimir } from "@/components/crm/boton-imprimir";
import { TituloParaImprimir } from "@/components/crm/titulo-para-imprimir";

export const dynamic = "force-dynamic";

/**
 * EL INFORME TÉCNICO EN EL FORMATO DE LESLY (0242).
 *
 * Los cinco Word de T:\formatos para santos son este mismo papel: el título
 * con el equipo («INFORME DE REVISIÓN DE LAVADORA LG 15 KG · MODELO …/serie»),
 * la cabecera con cliente, asunto, fechas de ejecución y de informe, horas de
 * inicio y culminación, técnico y quién elaboró; después las secciones de
 * texto, el contador de ciclos, la tabla «Cotizar: repuestos» y las fotos.
 * Carlos, 15-09: «¿por qué seguimos haciendo los formatos si ya tenemos la
 * herramienta? Tiene que generarlo en automático». Se imprime o se guarda
 * como PDF desde el navegador; el nombre del archivo sale del título.
 */
const TITULO: Record<string, string> = {
  llamada: "INFORME DE SOPORTE TÉCNICO",
  revision: "INFORME DE REVISIÓN",
  entrega: "INFORME DE RECEPCIÓN",
  mantenimiento_preventivo: "INFORME DE MANTENIMIENTO",
  mantenimiento_correctivo: "INFORME DE MANTENIMIENTO",
  puesta_en_marcha: "INFORME DE PUESTA EN MARCHA",
  preinstalacion: "INFORME DE PREINSTALACIÓN",
  evaluacion: "INFORME DE EVALUACIÓN",
  capacitacion: "INFORME DE CAPACITACIÓN",
  garantia: "INFORME DE ATENCIÓN EN GARANTÍA",
  tecnico: "INFORME TÉCNICO",
  informe_final: "INFORME FINAL",
};
const ASUNTO: Record<string, string> = {
  llamada: "Video llamada",
  revision: "Revisión de equipo",
  entrega: "Recepción de equipo",
  mantenimiento_preventivo: "Mantenimiento de equipo",
  mantenimiento_correctivo: "Mantenimiento correctivo",
  puesta_en_marcha: "Puesta en marcha",
  preinstalacion: "Preinstalación",
  capacitacion: "Capacitación",
  garantia: "Atención en garantía",
};

const fechaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima" }) : "—");
const hora = (h: string | null) => (h ? h.slice(0, 5) : null);

export default async function ImprimirInformePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase
    .from("informes_servicio")
    .select("*, cuentas(razon_social, num_doc), equipos_instalados(serie, modelo_texto), perfiles!informes_servicio_elaborado_por_fkey(nombre)")
    .eq("id", id)
    .single();
  if (!data) notFound();

  const cuenta = data.cuentas as unknown as { razon_social: string; num_doc: string | null } | null;
  const equipo = data.equipos_instalados as unknown as { serie: string; modelo_texto: string | null } | null;
  const elaborado = data.perfiles as unknown as { nombre: string } | null;
  const fotos = (data.fotos ?? []) as { path: string; etiqueta?: string }[];
  const repuestos = (data.repuestos ?? []) as { codigo: string | null; descripcion: string; cantidad: number | null; precio: number | null; stock: string | null }[];
  const { data: firmadas } = fotos.length
    ? await supabase.storage.from("adjuntos").createSignedUrls(fotos.map((f) => f.path), 3600)
    : { data: null };
  const urls = (firmadas ?? []).filter((f) => f.signedUrl).map((f) => f.signedUrl!);

  const tipo = String(data.tipo);
  const numero = data.correlativo != null ? `N.º ${data.es_prueba ? "PRUEBA " : ""}${String(data.correlativo).padStart(3, "0")}-${data.anio}` : "";
  const titulo = `${TITULO[tipo] ?? "INFORME TÉCNICO"} ${numero}`;
  const equipoLinea = [equipo?.modelo_texto ?? data.equipo_texto, equipo?.serie].filter(Boolean).join(" / ");
  const cliente = cuenta?.razon_social ?? (data.cliente_texto as string | null) ?? "—";
  const filas: [string, string | null][] = [
    ["Cliente", cliente],
    ["Asunto", (data.asunto as string | null) ?? ASUNTO[tipo] ?? etiquetaTipoServicio(tipo)],
    ["Fecha de ejecución", fechaCorta(data.ejecutado_at as string)],
    ["Fecha de informe", data.fecha_informe ? fechaCorta(`${data.fecha_informe}T12:00:00-05:00`) : fechaCorta(data.created_at as string)],
    ["Hora de inicio", hora(data.hora_inicio as string | null)],
    ["Hora de culminación", hora(data.hora_fin as string | null)],
    ["Técnico a cargo", (data.tecnico as string | null) ?? null],
    ["Elaboración de informe", elaborado?.nombre ?? null],
  ];
  const secciones: [string, string | null][] = [
    ["Descripción de equipo", (data.equipo_texto as string | null) ?? equipo?.modelo_texto ?? null],
    [tipo === "llamada" ? "Detalle del problema" : "Trabajo realizado", data.detalle as string | null],
    [tipo === "revision" || tipo === "entrega" ? "Revisión" : "Verificación / pruebas", data.verificacion as string | null],
    ["Observaciones", data.observaciones as string | null],
    ["Accesorios", data.accesorios as string | null],
    ["Pendiente", data.pendientes as string | null],
  ];

  return (
    <div className="hoja-informe mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed text-black">
      <div className="no-imprimir mb-4 flex items-center justify-between gap-3">
        <a href={`/postventa/informes/${id}`} className="text-xs text-muted-foreground hover:underline">
          ← Volver al informe
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
      {equipoLinea && <p className="text-center text-[12px] font-semibold uppercase">MODELO: {equipoLinea}</p>}

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

      {secciones
        .filter(([, v]) => v && v.trim())
        .map(([k, v]) => (
          <section key={k} className="mt-3">
            <p className="font-bold">{k}:</p>
            <p className="whitespace-pre-wrap">{v}</p>
          </section>
        ))}

      {data.ciclos != null && (
        <p className="mt-3">
          <b>Contador de ciclos:</b> {Number(data.ciclos).toLocaleString("es-PE")}
        </p>
      )}

      {repuestos.length > 0 && (
        <section className="mt-3">
          <p className="font-bold">Cotizar:</p>
          <p className="font-semibold">Repuestos:</p>
          <table className="mt-1 w-full border-collapse text-[11px]">
            <thead>
              <tr>
                {["Código", "Descripción", "Cantidad", "Precio", "IGV", "Stock"].map((h) => (
                  <th key={h} className="border border-neutral-500 bg-neutral-100 px-2 py-1 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {repuestos.map((r, i) => (
                <tr key={i}>
                  <td className="border border-neutral-500 px-2 py-1 font-mono">{r.codigo ?? "—"}</td>
                  <td className="border border-neutral-500 px-2 py-1">{r.descripcion}</td>
                  <td className="border border-neutral-500 px-2 py-1">{r.cantidad != null ? `${r.cantidad} und` : "—"}</td>
                  <td className="border border-neutral-500 px-2 py-1">{r.precio != null ? `$${Number(r.precio).toFixed(2)}` : "—"}</td>
                  <td className="border border-neutral-500 px-2 py-1">No incluye</td>
                  <td className="border border-neutral-500 px-2 py-1">{r.stock ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(data.cliente_conforme_nombre as string | null) && (
        <p className="mt-3">
          <b>Conformidad del cliente:</b> {data.cliente_conforme_nombre as string}
          {data.cliente_conforme_doc ? ` · DNI ${data.cliente_conforme_doc as string}` : ""}
        </p>
      )}

      {urls.length > 0 && (
        <section className="mt-4">
          <p className="font-bold">Registro fotográfico:</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {urls.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={u} alt={fotos[i]?.etiqueta ?? `Foto ${i + 1}`} className="max-h-72 w-full rounded border border-neutral-300 object-contain" />
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
