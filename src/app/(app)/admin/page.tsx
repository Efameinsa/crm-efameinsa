import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { cn } from "@/lib/utils";

const ETIQUETA_ROL: Record<string, string> = {
  admin: "Administrador",
  gerencia: "Gerencia",
  central: "Central",
  comercial: "Comercial",
};

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: perfiles } = await supabase
    .from("perfiles")
    .select("id, nombre, rol, codigo_comercial, activo")
    .order("nombre", { ascending: true });

  return (
    <SeccionPanel titulo="Usuarios">
      {!perfiles || perfiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay perfiles todavía. Cree cuentas desde el dashboard de Supabase (Authentication →
          Users) y agregue la fila correspondiente en <code>perfiles</code>.
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
                <TableCell className="font-medium text-foreground">{p.nombre}</TableCell>
                <TableCell>
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
                    {ETIQUETA_ROL[p.rol] ?? p.rol}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.codigo_comercial ?? "—"}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-medium",
                      p.activo ? "text-[#1E7F4F]" : "text-muted-foreground",
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", p.activo ? "bg-[#1E7F4F]" : "bg-muted-foreground/40")} />
                    {p.activo ? "Activo" : "Inactivo"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SeccionPanel>
  );
}
