import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: perfiles } = await supabase
    .from("perfiles")
    .select("id, nombre, rol, codigo_comercial, activo")
    .order("nombre", { ascending: true });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usuarios</CardTitle>
      </CardHeader>
      <CardContent>
        {!perfiles || perfiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay perfiles todavía. Cree cuentas desde el dashboard de Supabase
            (Authentication → Users) y agregue la fila correspondiente en{" "}
            <code>perfiles</code>.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perfiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.nombre}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.rol}</Badge>
                  </TableCell>
                  <TableCell>{p.codigo_comercial ?? "—"}</TableCell>
                  <TableCell>{p.activo ? "Activo" : "Inactivo"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
