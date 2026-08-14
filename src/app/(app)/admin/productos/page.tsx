import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { NuevoProductoForm } from "./nuevo-producto-form";

export default async function ProductosPage() {
  const supabase = await createClient();
  const { data: productos } = await supabase
    .from("productos")
    .select("id, marca, modelo, nombre, segmento, precios_producto(tier, precio)")
    .eq("activo", true)
    .order("marca");

  return (
    <div className="space-y-4">
      <SeccionPanel titulo="Nuevo producto">
        <NuevoProductoForm />
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
                    {(p.precios_producto as { tier: string; precio: number }[]).map((pr) => (
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
