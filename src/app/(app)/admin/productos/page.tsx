import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { NuevoProductoForm, type ProductoPlantilla } from "./nuevo-producto-form";

export default async function ProductosPage() {
  const supabase = await createClient();
  const { data: productos } = await supabase
    .from("productos")
    .select("id, sku, marca, modelo, nombre, segmento, categoria, capacidad, ficha, precios_producto(tier, precio, vigente_hasta)")
    .eq("activo", true)
    .order("marca");

  // Plantillas para "copiar la ficha de un equipo parecido": solo sirven las
  // que TIENEN ficha; copiar una vacía no ahorraría nada.
  const plantillas: ProductoPlantilla[] = (productos ?? [])
    .map((p) => {
      const f = (p.ficha ?? {}) as Record<string, unknown>;
      const lista = (k: string) =>
        Array.isArray(f[k]) ? (f[k] as unknown[]).filter((x): x is string => typeof x === "string") : [];
      const txt = (k: string) => (typeof f[k] === "string" && f[k] ? (f[k] as string) : null);
      return {
        id: p.id,
        etiqueta: `${p.marca} ${p.modelo} — ${p.nombre}`,
        segmento: p.segmento as "industrial" | "semi_industrial",
        categoria: p.categoria,
        capacidad: p.capacidad,
        caracteristicas: lista("caracteristicas"),
        dimensiones: lista("dimensiones"),
        medidas: lista("medidas"),
        calentamiento: txt("calentamiento"),
        panel: txt("panel"),
        controles: txt("controles"),
      };
    })
    .filter((p) => p.caracteristicas.length > 0);

  return (
    <div className="space-y-4">
      <SeccionPanel titulo="Nuevo equipo">
        <NuevoProductoForm plantillas={plantillas} />
      </SeccionPanel>

      <SeccionPanel titulo="Catálogo">
        {!productos || productos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay productos todavía.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marca / Modelo</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Segmento</TableHead>
                <TableHead>Precios</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium text-foreground">
                    {p.marca} {p.modelo}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.nombre}</TableCell>
                  <TableCell>
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground capitalize">
                      {p.segmento.replace("_", "-")}
                    </span>
                  </TableCell>
                  <TableCell className="space-x-2 text-xs tabular-nums text-muted-foreground">
                    {/* Solo el vigente: sin este filtro se listaban también los
                        precios vencidos, con el mismo tier repetido (26-08). */}
                    {(p.precios_producto as { tier: string; precio: number; vigente_hasta: string | null }[])
                      .filter((pr) => pr.vigente_hasta === null)
                      .map((pr) => (
                        <span key={pr.tier} className="capitalize">
                          {pr.tier}: {pr.precio.toLocaleString("es-PE")}
                        </span>
                      ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SeccionPanel>
    </div>
  );
}
