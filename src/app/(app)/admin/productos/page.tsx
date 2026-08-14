import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
      <Card>
        <CardHeader>
          <CardTitle>Nuevo producto</CardTitle>
        </CardHeader>
        <CardContent>
          <NuevoProductoForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
        </CardHeader>
        <CardContent>
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
                    <TableCell>
                      {p.marca} {p.modelo}
                    </TableCell>
                    <TableCell>{p.nombre}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{p.segmento}</Badge>
                    </TableCell>
                    <TableCell className="space-x-2 text-xs text-muted-foreground">
                      {(p.precios_producto as { tier: string; precio: number }[]).map((pr) => (
                        <span key={pr.tier}>
                          {pr.tier}: {pr.precio}
                        </span>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
