import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function CatalogosPage() {
  const supabase = await createClient();
  const [{ data: rubros }, { data: motivos }] = await Promise.all([
    supabase.from("catalogo_rubros").select("id, nombre, activo").order("nombre"),
    supabase.from("catalogo_motivos_rechazo").select("id, nombre, activo").order("nombre"),
  ]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Rubros</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rubros ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.nombre}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Motivos de rechazo</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(motivos ?? []).map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.nombre}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
