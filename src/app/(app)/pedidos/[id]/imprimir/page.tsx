import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { puedeVerPrecios } from "@/lib/postventa";
import { BotonImprimir } from "@/components/crm/boton-imprimir";
import { TituloParaImprimir } from "@/components/crm/titulo-para-imprimir";

export const dynamic = "force-dynamic";

const fecha = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00-05:00` : iso).toLocaleDateString("es-PE", { timeZone: "America/Lima" }) : "—";

type Contacto = { nombre?: string | null; telefono?: string | null; area?: string | null; correo?: string | null } | string | null;
const textoContacto = (c: Contacto) =>
  !c ? null : typeof c === "string" ? c : [c.nombre, c.telefono, c.area, c.correo].filter(Boolean).join(" · ") || null;

/**
 * EL PEDIDO (0290; Santos con el Ing. Carlos, 23-09 14:58).
 *
 * «El cierre, yo como Central lo convierto en pedido… me sale para imprimir el
 * pedido… llevo el expediente, ya no solamente con el cierre, sino con el
 * pedido, que ha sido generado por mí porque le he ingresado la serie».
 *
 * Es el cierre tal cual —no se modifica— más lo que agrega Central: el número
 * del pedido (lo pone el CRM desde el 0295) y la serie de cada equipo. Va
 * como anexo del cierre. Si una serie todavía no está
 * (se puede ejecutar sin ella, decisión del 23-09), el papel lo dice.
 */
export default async function ImprimirPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await requerirPerfil();
  const verPrecios = puedeVerPrecios(perfil);
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("servicios_postventa")
    .select("id, informe_cierre_id, numero_pedido_erp, cliente_texto, pedido_ejecutado_at, liquidacion_at, modalidad, pedido_generado_por, pedido_ejecutado_por, liquidacion_subida_por, liquidacion_por")
    .eq("id", id)
    .maybeSingle();
  if (!s) notFound();
  const [{ data: inf }, { data: equipos }] = await Promise.all([
    s.informe_cierre_id
      ? supabase
          .from("informes_cierre")
          .select("codigo, serie, fecha, cliente_nombre, cliente_doc, cliente_direccion, orden_compra, contacto_despacho, entrega_lugar, entrega_direccion, entrega_fecha, nota_despacho, modalidad_pago, moneda, monto_total, items, perfiles!informes_cierre_creado_por_fkey(nombre, codigo_comercial)")
          .eq("id", s.informe_cierre_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("pedido_equipos").select("orden, descripcion, serie").eq("servicio_id", id).order("orden"),
  ]);
  const i = inf as unknown as {
    codigo: string | null; serie: string | null; fecha: string | null; cliente_nombre: string; cliente_doc: string | null; cliente_direccion: string | null;
    orden_compra: string | null; contacto_despacho: Contacto; entrega_lugar: string | null; entrega_direccion: string | null; entrega_fecha: string | null;
    nota_despacho: string | null; modalidad_pago: string[] | null; moneda: string | null; monto_total: number | null;
    items: { bloque?: string; descripcion: string; cantidad: number }[] | null;
    perfiles: { nombre: string; codigo_comercial: string | null } | null;
  } | null;
  // Las firmas llevan el nombre de quien lo hizo (Carlos, 23-09 17:24: «la
  // Central puede firmar y Finanzas la recepción… pongo solamente los nombres»).
  const idCentral = s.pedido_generado_por ?? s.pedido_ejecutado_por;
  const idFinanzas = s.liquidacion_subida_por;
  const ids = [idCentral, idFinanzas].filter(Boolean) as string[];
  const { data: firmantes } = ids.length ? await supabase.from("perfiles").select("id, nombre").in("id", ids) : { data: [] };
  const nombreDe = (x: string | null) => (firmantes ?? []).find((f) => f.id === x)?.nombre ?? "";
  const lista = (equipos ?? []) as { orden: number; descripcion: string; serie: string | null }[];
  const pendientes = lista.filter((e) => !e.serie).length;
  const empresa = i?.serie === "OPEN" ? "Open Investments" : "Corporación Efameinsa e Ingeniería S.A.";
  const cliente = i?.cliente_nombre ?? (s.cliente_texto ?? "").replace(/^\d{8,11}\s*-\s*/, "");
  const titulo = `PEDIDO ${s.numero_pedido_erp ?? "SIN NÚMERO"}`;
  const otros = (i?.items ?? []).filter((x) => x.bloque && x.bloque !== "venta");
  const filas: [string, string | null][] = [
    ["Cliente", cliente],
    ["RUC / DNI", i?.cliente_doc ?? null],
    ["Dirección fiscal", i?.cliente_direccion ?? null],
    ["Cierre de venta", i?.codigo ? `N.º ${i.codigo} · ${empresa} · ${fecha(i.fecha)}` : null],
    ["Comercial", i?.perfiles ? `${i.perfiles.codigo_comercial ? `${i.perfiles.codigo_comercial} · ` : ""}${i.perfiles.nombre}` : null],
    ["Orden de compra", i?.orden_compra ?? null],
    ["Forma de pago", (i?.modalidad_pago ?? []).join(" + ") || null],
    ["Total", verPrecios && i?.monto_total != null ? `${i.moneda ?? ""} ${Number(i.monto_total).toLocaleString("es-PE", { minimumFractionDigits: 2 })}` : null],
    ["Entrega", [i?.entrega_lugar, i?.entrega_direccion].filter(Boolean).join(" · ") || null],
    // La fecha de entrega del cierre es texto libre («25/09/2026», «Por confirmar»): va tal cual.
    ["Fecha de entrega", i?.entrega_fecha?.trim() || null],
    ["Quién recibe", textoContacto(i?.contacto_despacho ?? null)],
  ];

  return (
    <div className="hoja-pedido mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed text-black">
      <div className="no-imprimir mb-4 flex items-center justify-between gap-3">
        <a href="/central/cierres" className="text-xs text-muted-foreground hover:underline">
          ← Volver a Cierres de venta
        </a>
        <TituloParaImprimir titulo={`${titulo} - ${cliente}`.replace(/[^\w\s.\-áéíóúñÁÉÍÓÚÑ]/g, "")} />
        <BotonImprimir>Imprimir / guardar PDF</BotonImprimir>
      </div>

      <div className="mb-3 flex items-center justify-between border-b-2 border-[#8B1510] pb-2">
        <div>
          <p className="text-lg font-bold tracking-wide">EFAMEINSA</p>
          <p className="text-[11px] text-neutral-600">{empresa} · Central</p>
        </div>
        <p className="text-right text-[11px] text-neutral-600">
          Generado el {fecha(new Date().toISOString())}
          <br />
          www.efameinsa.com
        </p>
      </div>

      <h1 className="text-center text-base font-bold uppercase">{titulo}</h1>
      {pendientes > 0 && (
        <p className="mt-1 text-center text-[12px] font-semibold text-[#8B1510]">
          {pendientes} equipo{pendientes === 1 ? "" : "s"} con SERIE PENDIENTE
        </p>
      )}

      <table className="mt-3 w-full border-collapse text-[12px]">
        <tbody>
          {filas
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <tr key={k}>
                <th className="w-44 border border-neutral-500 bg-neutral-100 px-2 py-1 text-left font-semibold">{k}:</th>
                <td className="whitespace-pre-line border border-neutral-500 px-2 py-1">{v}</td>
              </tr>
            ))}
        </tbody>
      </table>

      <section className="mt-4">
        <p className="font-bold">Equipos y series:</p>
        <table className="mt-1 w-full border-collapse text-[12px]">
          <thead>
            <tr>
              {["#", "Equipo", "Serie"].map((h) => (
                <th key={h} className="border border-neutral-500 bg-neutral-100 px-2 py-1 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map((e, k) => (
              <tr key={k}>
                <td className="w-8 border border-neutral-500 px-2 py-1 align-top">{k + 1}</td>
                <td className="whitespace-pre-line border border-neutral-500 px-2 py-1">{e.descripcion}</td>
                <td className="w-40 border border-neutral-500 px-2 py-1 align-top font-mono font-semibold">
                  {e.serie ?? <span className="font-sans text-[#8B1510]">SERIE PENDIENTE</span>}
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={3} className="border border-neutral-500 px-2 py-2 text-neutral-600">
                  Sin equipos cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {otros.length > 0 && (
        <section className="mt-3">
          <p className="font-bold">Otros conceptos del cierre:</p>
          <ul className="mt-1 list-disc pl-5">
            {otros.map((o, k) => (
              <li key={k} className="whitespace-pre-line">
                {o.cantidad} × {o.descripcion} {o.bloque === "gratuito" ? "(sin costo)" : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {i?.nota_despacho && (
        <section className="mt-3">
          <p className="font-bold">Nota para el despacho:</p>
          <p className="whitespace-pre-line">{i.nota_despacho}</p>
        </section>
      )}

      <div className="mt-10 grid grid-cols-2 gap-10 text-center text-[11px]">
        <div className="border-t border-neutral-500 pt-1">
          Central{nombreDe(idCentral) && <p className="font-semibold">{nombreDe(idCentral)}</p>}
        </div>
        <div className="border-t border-neutral-500 pt-1">
          Finanzas (recepción){nombreDe(idFinanzas) && <p className="font-semibold">{nombreDe(idFinanzas)}</p>}
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body * { visibility: hidden !important; }
          .hoja-pedido, .hoja-pedido * { visibility: visible !important; }
          .hoja-pedido { position: absolute; inset: 0; max-width: none; padding: 0; margin: 0; }
          .no-imprimir { display: none !important; }
        }
      `}</style>
    </div>
  );
}
