import { Boxes } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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

  const [{ filas, totales }, proyeccion, { data: lineas }, { data: productos }, porEmpresa] = await Promise.all([
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
  ]);

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
