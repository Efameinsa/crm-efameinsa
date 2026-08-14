import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeccionPanel } from "@/components/crm/seccion-panel";

export default async function CatalogosPage() {
  const supabase = await createClient();
  const [{ data: rubros }, { data: motivos }, { data: resultados }] = await Promise.all([
    supabase.from("catalogo_rubros").select("id, nombre, activo").order("nombre"),
    supabase.from("catalogo_motivos_rechazo").select("id, nombre, activo").order("nombre"),
    supabase.from("catalogo_resultados_gestion").select("id, codigo, nombre, activo").order("id"),
  ]);

  return (
    <div className="grid gap-4 md:grid-cols-3">
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
      <SeccionPanel titulo="Resultados de gestión">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(resultados ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.codigo}</TableCell>
                <TableCell className="text-foreground">{r.nombre}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SeccionPanel>
    </div>
  );
}
