import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import {
  BotonResumenPdf,
  ListaCodigos,
  ResumenSubida,
  RevisarStock,
  SubirExcelStock,
  type CodigoCatalogo,
  type CodigosExistentes,
} from "@/components/crm/stock-importaciones";
import { ResumenGeneralStock } from "@/components/crm/resumen-general-stock";
import { AlmacenPorSerie } from "@/components/crm/almacen-por-serie";
import { cargarAlmacenPorSerie, cargarContraste, cargarProyeccion, contarPorEmpresa } from "@/lib/almacen-datos";
import type { FilaCarga } from "@/lib/acciones/stock-importaciones";
import { productosParaComparar, type CargaStock } from "@/lib/acciones/stock-importaciones";
import { rasgos } from "@/lib/stock-importaciones";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * STOCK Y CÓDIGOS (0576, Lesly y el ing. 21-10-2026).
 *
 * Dos pestañas para las dos cosas que pidió Lesly: subir el Excel de stock de
 * Importaciones y que el CRM le diga qué código le toca a cada máquina; y la
 * lista de todos los códigos ya creados, con un buscador que, al pegar la
 * descripción de un equipo que llega, dice si ya tiene código o propone uno.
 */
export default async function StockPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const perfil = await requerirPerfil();
  if (!(["operaciones", "gerencia", "admin"].includes(perfil.rol) || perfil.es_operaciones)) redirect("/comercial/stock");
  const { ver } = await searchParams;
  const pestana = ver === "codigos" ? "codigos" : ver === "almacen" ? "almacen" : "subir";
  const supabase = await createClient();

  let contenido: React.ReactNode;
  if (pestana === "subir") {
    // Una carga viva por empresa (Santos 23-10): el Excel de Efameinsa no tapa ni reemplaza el de Open.
    const [{ data: lista }, porEmpresa] = await Promise.all([
      supabase
        .from("stock_cargas")
        .select("id, archivo, hojas, filas, ausentes, estado, resultado, empresa, created_at, subida_at")
        .in("estado", ["revisando", "subida"])
        .order("created_at", { ascending: false })
        .limit(10),
      contarPorEmpresa(supabase),
    ]);
    const vistas = new Set<string>();
    const cargas: CargaStock[] = [];
    for (const d of lista ?? []) {
      const emp = (d.empresa ?? "OPEN") as CargaStock["empresa"];
      if (vistas.has(emp)) continue;
      vistas.add(emp);
      cargas.push({
        id: d.id,
        archivo: d.archivo,
        hojas: d.hojas ?? [],
        filas: d.filas ?? [],
        ausentes: d.ausentes ?? [],
        estado: d.estado,
        resultado: d.resultado,
        empresa: emp,
        createdAt: d.created_at,
        subidaAt: d.subida_at,
      });
    }
    const hayRevision = cargas.some((c) => c.estado === "revisando");
    // Para la señal tenue de cada casilla: ¿ese código ya existe o se va a crear?
    const existentes: CodigosExistentes = {};
    if (hayRevision) for (const p of await productosParaComparar()) existentes[p.sku] = { activo: p.activo };
    contenido = (
      <div className="space-y-4">
        <SubirExcelStock hayCarga={cargas.length > 0} />
        {cargas.map((carga) => (
          <section key={carga.id} className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              Stock de {carga.empresa}
              <span className="ml-2 text-xs font-normal text-muted-foreground">{carga.archivo}</span>
            </h3>
            {carga.estado === "revisando" && <RevisarStock carga={carga} existentes={existentes} />}
            {carga.estado === "subida" && carga.resultado && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Última subida:{" "}
                  {new Date(carga.subidaAt ?? carga.createdAt).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}
                </p>
                <ResumenSubida resultado={carga.resultado} />
                <BotonResumenPdf cargaId={carga.id} />
              </div>
            )}
          </section>
        ))}
        {/* El informe de los lunes de Importaciones, ahora armado por el CRM (reunión Santos–Lesly 22-10). */}
        <ResumenGeneralStock porEmpresa={porEmpresa} />
      </div>
    );
  } else if (pestana === "almacen") {
    // El almacén por serie (Carlos 22-10): máquinas con su pedido, totales como en la hoja de
    // Importaciones, lo que está por llegar y el cotejo con el catálogo. Gerencia mira; operaciones edita.
    const { data: revisando } = await supabase.from("stock_cargas").select("filas").eq("estado", "revisando").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const [{ filas, totales }, proyeccion, contraste] = await Promise.all([
      cargarAlmacenPorSerie(supabase),
      cargarProyeccion(supabase),
      cargarContraste(supabase, (revisando?.filas ?? null) as FilaCarga[] | null),
    ]);
    // Santos (22-10): «el gerente también debe poder editar todo».
    const puedeEditar = ["operaciones", "gerencia", "admin"].includes(perfil.rol) || !!perfil.es_operaciones;
    contenido = <AlmacenPorSerie filas={filas} totales={totales} contraste={contraste} proyeccion={proyeccion} puedeEditar={puedeEditar} />;
  } else {
    const [productos, { data: stock }] = await Promise.all([productosParaComparar(), supabase.rpc("stock_por_producto")]);
    const enAlmacen = new Map(((stock ?? []) as { producto_id: string; disponibles: number }[]).map((s) => [s.producto_id, s.disponibles]));
    const codigos: CodigoCatalogo[] = productos
      .filter((p) => !/^(SER|IM|EJ-)/.test(p.sku))
      .map((p) => {
        // Manda la descripción oficial; la ficha solo rellena (igual que al comparar).
        const r = rasgos([p.modelo, p.nombre, p.descripcion].join(" "));
        const deFicha = rasgos([p.panel, p.calentamiento].join(" "));
        for (const k of Object.keys(deFicha) as (keyof typeof deFicha)[]) r[k] ??= deFicha[k];
        return {
          sku: p.sku,
          nombre: p.nombre,
          modelo: p.modelo ?? "",
          activo: p.activo,
          enPreparacion: !!p.enPreparacion,
          rasgos: [r.control, r.calentamiento, r.cilindro, r.voltaje, r.sistemaLg, r.apilable && `apilable: ${r.apilable}`].filter(Boolean).join(" · "),
          enAlmacen: enAlmacen.get(p.id) ?? 0,
        };
      })
      .sort((a, b) => a.sku.localeCompare(b.sku));
    contenido = <ListaCodigos codigos={codigos} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-[linear-gradient(135deg,rgb(139_21_16/0.07),transparent_60%)] p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#8B1510] text-white">
          <Boxes className="size-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Stock y códigos</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            Suba el Excel de stock de Importaciones y las máquinas entran al almacén en el acto. El CRM solo le señala las observaciones: las que
            no tienen código, las que hay que revisar y las series que ya están con un cliente. Cada Excel es de una empresa (Open o Efameinsa) y no se mezclan. El costo solo lo ven operaciones y gerencia.
          </p>
        </div>
      </div>
      <div className="flex gap-1 border-b border-border">
        {[
          { clave: "subir", etiqueta: "Subir el Excel de stock", href: "/operaciones/stock" },
          { clave: "almacen", etiqueta: "Almacén por serie", href: "/operaciones/stock?ver=almacen" },
          { clave: "codigos", etiqueta: "Códigos y series", href: "/operaciones/stock?ver=codigos" },
        ].map((t) => (
          <Link
            key={t.clave}
            href={t.href}
            prefetch={false}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              pestana === t.clave ? "border-[#8B1510] font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.etiqueta}
          </Link>
        ))}
      </div>
      <SeccionPanel titulo={pestana === "subir" ? "Subir el Excel de stock" : pestana === "almacen" ? "Almacén por serie" : "Códigos y series"}>{contenido}</SeccionPanel>
    </div>
  );
}
