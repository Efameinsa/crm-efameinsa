"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { actualizarUsuario, borrarUsuario, cambiarEstadoUsuario } from "@/lib/acciones/usuarios";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const ROLES = [
  ["comercial", "Comercial"],
  ["central", "Central"],
  ["gerencia", "Gerencia"],
  ["admin", "Administrador"],
] as const;

interface Props {
  perfil: {
    id: string;
    nombre: string;
    rol: string;
    codigo_comercial: string | null;
    activo: boolean;
    email_contacto: string | null;
  };
  esUsted: boolean;
}

export function FilaUsuario({ perfil, esUsted }: Props) {
  const [rol, setRol] = useState(perfil.rol);
  const [codigo, setCodigo] = useState(perfil.codigo_comercial ?? "");
  const [guardando, startGuardar] = useTransition();
  const [cambiando, startCambiar] = useTransition();
  const [borrando, startBorrar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);

  const cambió = rol !== perfil.rol || codigo !== (perfil.codigo_comercial ?? "");

  function guardar() {
    const formData = new FormData();
    formData.set("id", perfil.id);
    formData.set("rol", rol);
    formData.set("codigo", rol === "comercial" ? codigo : "");
    startGuardar(async () => {
      const r = await actualizarUsuario(formData);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`${perfil.nombre} actualizado`);
    });
  }

  function cambiarEstado() {
    startCambiar(async () => {
      const r = await cambiarEstadoUsuario(perfil.id, !perfil.activo);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(perfil.activo ? `${perfil.nombre} desactivado` : `${perfil.nombre} activado`);
    });
  }

  // Borrar no es desactivar (ver borrarUsuario en lib/acciones/usuarios.ts):
  // solo sale bien con una cuenta sin historial. Si tiene, el servidor
  // responde con lo que tiene y el admin desactiva en vez de borrar.
  function borrar() {
    startBorrar(async () => {
      const r = await borrarUsuario(perfil.id);
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      toast.success(`${perfil.nombre} borrado`);
      setConfirmando(false);
    });
  }

  return (
    <TableRow className={cn(!perfil.activo && "opacity-60")}>
      <TableCell className="font-medium text-foreground">
        {perfil.nombre}
        {esUsted && <span className="ml-2 text-xs font-normal text-muted-foreground">(usted)</span>}
        <span className="block text-xs font-normal text-muted-foreground">{perfil.email_contacto ?? "—"}</span>
      </TableCell>
      <TableCell>
        <Select value={rol} onValueChange={(v) => setRol(v || perfil.rol)}>
          <SelectTrigger className="h-8 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map(([valor, etiqueta]) => (
              <SelectItem key={valor} value={valor}>
                {etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          disabled={rol !== "comercial"}
          maxLength={4}
          placeholder="—"
          className="h-8 w-20 uppercase"
        />
      </TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium",
            perfil.activo ? "text-[#1E7F4F]" : "text-muted-foreground",
          )}
        >
          <span className={cn("size-1.5 rounded-full", perfil.activo ? "bg-[#1E7F4F]" : "bg-muted-foreground/40")} />
          {perfil.activo ? "Activo" : "Inactivo"}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {cambió && (
            <Button size="sm" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={cambiarEstado}
            disabled={cambiando || (esUsted && perfil.activo)}
            title={esUsted && perfil.activo ? "No puede desactivarse a usted mismo" : undefined}
          >
            {perfil.activo ? "Desactivar" : "Activar"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmando(true)}
            disabled={borrando || esUsted}
            title={esUsted ? "No puede borrarse a usted mismo" : "Borrar este usuario"}
            aria-label={`Borrar a ${perfil.nombre}`}
            className="px-2 text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        <Dialog open={confirmando} onOpenChange={setConfirmando}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>¿Borrar a {perfil.nombre}?</DialogTitle>
              <DialogDescription className="space-y-2 text-sm">
                <span className="block">
                  Se elimina su acceso al CRM y su ficha de usuario
                  {perfil.email_contacto && (
                    <>
                      {" "}
                      (<span className="font-mono text-xs">{perfil.email_contacto}</span>)
                    </>
                  )}
                  . No se puede deshacer.
                </span>
                <span className="block text-muted-foreground">
                  Solo se puede borrar una cuenta sin historial. Si esta persona ya tiene clientes, gestiones,
                  cotizaciones o cierres, el sistema lo va a rechazar: en ese caso corresponde desactivarla, para
                  que todo lo que hizo siga a su nombre.
                </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setConfirmando(false)} disabled={borrando}>
                Cancelar
              </Button>
              <Button variant="destructive" size="sm" onClick={borrar} disabled={borrando}>
                {borrando ? "Borrando…" : "Sí, borrarlo"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}
