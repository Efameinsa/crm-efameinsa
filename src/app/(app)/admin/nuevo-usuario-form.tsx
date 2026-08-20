"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, UserPlus } from "lucide-react";
import { crearUsuario } from "@/lib/acciones/usuarios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ROLES = [
  ["comercial", "Comercial", "Vende y tiene cartera propia. Necesita código."],
  ["central", "Central", "Recibe los contactos entrantes y los deriva."],
  ["gerencia", "Gerencia", "Ve todos los paneles y aprueba precios."],
  ["admin", "Administrador", "Todo lo anterior más el manejo de usuarios."],
] as const;

export function NuevoUsuarioForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [rol, setRol] = useState<string>("comercial");
  const [clave, setClave] = useState<{ email: string; clave: string } | null>(null);
  const [enviando, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "");
    startTransition(async () => {
      const r = await crearUsuario(formData);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Usuario creado");
      // La contraseña no vuelve a mostrarse nunca: se enseña acá una vez y el
      // administrador se la pasa a la persona, que la cambia al entrar.
      setClave({ email, clave: r.clave! });
      formRef.current?.reset();
      setRol("comercial");
    });
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.4fr_1fr_auto_auto] lg:items-end">
        <div className="space-y-2">
          <Label htmlFor="nombre">Nombre y apellido</Label>
          <Input id="nombre" name="nombre" required placeholder="Katerine Tello" autoComplete="off" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Correo con el que entra</Label>
          <Input id="email" name="email" type="email" required placeholder="comercial5@efameinsa.com" autoComplete="off" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rol">Tipo de usuario</Label>
          <Select name="rol" value={rol} onValueChange={(v) => setRol(v || "comercial")} required>
            <SelectTrigger id="rol" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map(([valor, etiqueta, ayuda]) => (
                <SelectItem key={valor} value={valor}>
                  <span className="font-medium">{etiqueta}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{ayuda}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="codigo">Código</Label>
          <Input
            id="codigo"
            name="codigo"
            placeholder="C6"
            className="w-24 uppercase"
            maxLength={4}
            disabled={rol !== "comercial"}
            required={rol === "comercial"}
          />
        </div>
        <Button type="submit" disabled={enviando}>
          <UserPlus className="size-4" />
          {enviando ? "Creando…" : "Crear usuario"}
        </Button>
      </form>

      {clave && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-semibold text-foreground">Contraseña temporal — cópiela ahora</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No se vuelve a mostrar. Pásesela a <b className="text-foreground">{clave.email}</b> por un medio
            privado; al entrar la cambia desde el botón <b className="text-foreground">Contraseña</b>, arriba a la derecha.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded bg-card px-2 py-1 font-mono text-sm text-foreground">{clave.clave}</code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(clave.clave);
                toast.success("Contraseña copiada");
              }}
            >
              <Copy className="size-3.5" />
              Copiar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setClave(null)}>
              Ya la guardé
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
