import Link from "next/link";
import { Boxes, Printer } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { AlmacenPorSerie } from "@/components/crm/almacen-por-serie";
import { AgregarAlStock, CentralPideSerie, type CodigoParaAgregar, type MaquinaDisponible, type MaquinaQueEsperaSerie } from "@/components/crm/stock-del-almacen";
import { cargarAlmacenPorSerie, cargarProyeccion, contarPorEmpresa } from "@/lib/almacen-datos";
import { ResumenGeneralStock } from "@/components/crm/resumen-general-stock";

export const dynamic = "force-dynamic";

/**
 * EL STOCK EN EL MÓDULO DEL ALMACÉN (Santos y Lesly, 23-10 18:25).
 *
 * «Ya no vamos a trabajar desde el Excel… esto debería estar en el módulo de almacén,
 * porque almacén es el que va a trabajar el stock». De arriba abajo, en el orden en que
 * se usa: lo que Central espera (elegir la serie con un check), lo que llega (agregar
 * al stock) y el stock por serie. El costo no se ve acá: es de operaciones y gerencia.
 */
export default async function StockDelAlmacenPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const veCosto = ["operaciones", "gerencia", "admin"].includes(perfil.rol) || !!perfil.es_operaciones;

  // LO YA RESPONDIDO (Santos 24-10: Lesly respondió el código y, como la tarjeta desaparece,
  // no tenía dónde ver qué dio para contestarle a Brenda). Últimos 7 días, lo más nuevo arriba.
  const hoy = hoyLima();
  const hace7 = new Date(new Date(`${hoy}T00:00:00-05:00`).getTime() - 7 * 86_400_000).toISOString();
  const [{ filas, totales }, proyeccion, { data: lineas }, { data: productos }, porEmpresa, { data: dadas }] = await Promise.all([
    cargarAlmacenPorSerie(supabase),
    cargarProyeccion(supabase),
    supabase
      .from("pedido_equipos")
      .select(
        "id, descripcion, sku, sin_stock_motivo, procedencia, servicios_postventa!inner(id, cliente_texto, numero_pedido_erp, series_pedidas_at, despachado_at, cerrado_at, cuentas(razon_social))",
      )
      .is("serie", null)
      .eq("sin_serie", false)
      .is("parte_de", null)
      .not("servicios_postventa.series_pedidas_at", "is", null)
      .is("servicios_postventa.despachado_at", null)
      .is("servicios_postventa.cerrado_at", null)
      .limit(300),
    supabase.from("productos").select("id, sku, nombre, modelo").eq("activo", true).not("sku", "is", null).order("sku").limit(3000),
    contarPorEmpresa(supabase),
    supabase
      .from("pedido_equipos")
      .select("id, servicio_id, orden, parte_de, parte_nombre, descripcion, serie, serie_registrada_at, serie_registrada_por, servicios_postventa!inner(id, cliente_texto, numero_pedido_erp, series_pedidas_at, cuentas(razon_social))")
      .not("serie", "is", null)
      .gte("serie_registrada_at", hace7)
      .not("servicios_postventa.series_pedidas_at", "is", null)
      .order("serie_registrada_at", { ascending: false })
      .limit(300),
  ]);

  type Dada = {
    servicio_id: string; orden: number; parte_de: string | null; parte_nombre: string | null; descripcion: string; serie: string;
    serie_registrada_at: string; serie_registrada_por: string | null;
    servicios_postventa: { cliente_texto: string | null; numero_pedido_erp: string | null; cuentas: { razon_social: string } | null };
  };
  const dadasFilas = (dadas ?? []) as unknown as Dada[];
  const idsGente = [...new Set(dadasFilas.map((d) => d.serie_registrada_por).filter(Boolean) as string[])];
  const { data: gente } = idsGente.length ? await supabase.from("perfiles").select("id, nombre").in("id", idsGente) : { data: [] };
  const nombreDe = new Map(((gente ?? []) as { id: string; nombre: string }[]).map((g) => [g.id, g.nombre]));
  const respondidas: { servicioId: string; cliente: string; pedido: string | null; ultima: string; quien: string | null; series: { que: string; serie: string }[] }[] = [];
  for (const d of dadasFilas) {
    let r = respondidas.find((x) => x.servicioId === d.servicio_id);
    if (!r) {
      r = {
        servicioId: d.servicio_id,
        cliente: (d.servicios_postventa.cuentas?.razon_social ?? d.servicios_postventa.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, ""),
        pedido: d.servicios_postventa.numero_pedido_erp,
        ultima: d.serie_registrada_at,
        quien: d.serie_registrada_por ? (nombreDe.get(d.serie_registrada_por) ?? null) : null,
        series: [],
      };
      respondidas.push(r);
    }
    r.series.push({ que: d.parte_nombre ?? d.descripcion.split("\n")[0].replace(/^Secadora · /, "").slice(0, 60), serie: d.serie });
  }
  const cuando = (iso: string) => {
    const dia = new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    const hora = new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });
    return dia === hoy ? `hoy ${hora}` : `${dia.split("-").reverse().join("/")} ${hora}`;
  };

  type Linea = {
    id: string; descripcion: string; sku: string | null; sin_stock_motivo: string | null; procedencia: string | null;
    servicios_postventa: { id: string; cliente_texto: string | null; numero_pedido_erp: string | null; series_pedidas_at: string | null; cuentas: { razon_social: string } | null };
  };
  const esperan: MaquinaQueEsperaSerie[] = ((lineas ?? []) as unknown as Linea[])
    .map((l) => ({
      itemId: l.id,
      servicioId: l.servicios_postventa.id,
      cliente: (l.servicios_postventa.cuentas?.razon_social ?? l.servicios_postventa.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, ""),
      pedido: l.servicios_postventa.numero_pedido_erp,
      pedidoDesde: l.servicios_postventa.series_pedidas_at,
      descripcion: l.descripcion,
      sku: l.sku,
      porImportar: !!l.sin_stock_motivo,
    }))
    .sort((a, b) => (a.pedidoDesde ?? "").localeCompare(b.pedidoDesde ?? ""));

  const stock: MaquinaDisponible[] = filas
    .filter((f) => f.estado === "disponible")
    .map((f) => ({ id: f.id, serie: f.serie, codigo: f.codigo, marca: f.marca, modelo: f.modelo, descripcion: f.descripcion, ubicacion: f.ubicacion, empresa: f.empresa, ingreso: f.ingreso }));
  const codigos = ((productos ?? []) as { id: string; sku: string; nombre: string; modelo: string | null }[]).map(
    (p): CodigoParaAgregar => ({ id: p.id, sku: p.sku.toUpperCase(), nombre: p.nombre, modelo: p.modelo }),
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-[linear-gradient(135deg,rgb(139_21_16/0.07),transparent_60%)] p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#8B1510] text-white">
          <Boxes className="size-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Stock del almacén</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            El stock oficial de la empresa, máquina por máquina. Cuando Central pide la serie de un pedido, elíjala acá con un check: queda en el pedido y
            sale del disponible. Lo que llega a planta se agrega abajo, sin Excel.
          </p>
        </div>
      </div>

      <SeccionPanel titulo={`Central pide la serie${esperan.length ? ` (${esperan.length})` : ""}`}>
        <CentralPideSerie esperan={esperan} stock={stock} />
      </SeccionPanel>

      {respondidas.length > 0 && (
        <SeccionPanel titulo={`Ya respondidas · últimos 7 días (${respondidas.length})`}>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Las series que el almacén ya dio. Cuando un pedido tiene todas, a Central le llega el aviso «Series listas». Sirve para confirmar a quien pregunte y para volver a imprimir la respuesta.
          </p>
          <ul className="divide-y divide-border">
            {respondidas.map((r) => (
              <li key={r.servicioId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="w-28 flex-none text-xs tabular-nums text-muted-foreground">{cuando(r.ultima)}</span>
                <Link href={`/almacen/pedidos/${r.servicioId}`} className="min-w-0 flex-1 hover:underline">
                  <span className="block text-sm font-semibold text-foreground">
                    {r.cliente}
                    {r.pedido ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{r.pedido}</span> : null}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {r.series.map((x, i) => (
                      <span key={i} className="mr-3 inline-block">
                        {x.que}: <span className="font-mono font-semibold text-foreground">{x.serie}</span>
                      </span>
                    ))}
                  </span>
                  {r.quien && <span className="text-[11px] text-muted-foreground">Respondió {r.quien}</span>}
                </Link>
                <a
                  href={`/almacen/pedidos/${r.servicioId}/solicitud?que=respuesta`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <Printer className="size-3.5" /> Imprimir la respuesta
                </a>
              </li>
            ))}
          </ul>
        </SeccionPanel>
      )}

      <SeccionPanel titulo="Agregar al stock">
        <AgregarAlStock codigos={codigos} />
      </SeccionPanel>

      {/* El resumen en PDF: solo Open, solo Efameinsa o el consolidado (Santos 23-10). */}
      <ResumenGeneralStock porEmpresa={porEmpresa} />

      <SeccionPanel titulo="Stock por serie">
        <AlmacenPorSerie filas={filas} totales={totales} contraste={[]} proyeccion={proyeccion} puedeEditar={veCosto} verCosto={veCosto} />
      </SeccionPanel>
    </div>
  );
}
