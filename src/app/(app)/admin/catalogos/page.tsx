import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeccionPanel } from "@/components/crm/seccion-panel";

export default async function CatalogosPage() {
  const supabase = await createClient();
  const [{ data: rubros }, { data: motivos }] = await Promise.all([
    supabase.from("catalogo_rubros").select("id, nombre, activo").order("nombre"),
    supabase.from("catalogo_motivos_rechazo").select("id, nombre, activo").order("nombre"),
  ]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SeccionPanel titulo="Rubros">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rubros ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-foreground">{r.nombre}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SeccionPanel>
      <SeccionPanel titulo="Motivos de rechazo">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(motivos ?? []).map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-foreground">{m.nombre}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SeccionPanel>
    </div>
  );
}
