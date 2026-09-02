import { requerirRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { NuevoUsuarioForm } from "./nuevo-usuario-form";
import { FilaUsuario } from "./fila-usuario";

export default async function AdminPage() {
  // Segunda barrera: el layout ya filtra por rol, pero esta pantalla da de
  // alta accesos al sistema y no se apoya en una sola comprobación.
  const yo = await requerirRol(["admin"]);

  const supabase = await createClient();
  const { data: perfiles } = await supabase
    .from("perfiles")
    .select("id, nombre, rol, codigo_comercial, activo, email_contacto")
    .order("activo", { ascending: false })
    .order("nombre", { ascending: true });

  const activos = perfiles?.filter((p) => p.activo).length ?? 0;

  return (
    <div className="space-y-6">
      <SeccionPanel titulo="Crear usuario">
        <NuevoUsuarioForm />
        <p className="mt-3 text-[11px] text-muted-foreground">
          El código identifica la <b className="text-foreground">cartera</b>, no a la persona: cuando alguien
          se va, su código pasa a quien lo reemplaza y con él todo el historial de esa cartera. Por eso un
          comercial activo no puede quedarse sin código.
        </p>
      </SeccionPanel>

      <SeccionPanel titulo={`Usuarios (${activos} activo${activos === 1 ? "" : "s"})`}>
        {!perfiles || perfiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay usuarios.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre y correo</TableHead>
                <TableHead>Tipo de usuario</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perfiles.map((p) => (
                <FilaUsuario key={p.id} perfil={p} esUsted={p.id === yo.id} />
              ))}
            </TableBody>
          </Table>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Desactivar no borra nada: la persona deja de entrar pero su historial, su cartera y sus cotizaciones
          siguen donde están. Para pasar una cartera a otra persona, cámbiele el código al nuevo dueño.
          Borrar es solo para el acceso que sobró (creado por error o de práctica): únicamente se puede con una
          cuenta sin historial.
        </p>
      </SeccionPanel>
    </div>
  );
}
