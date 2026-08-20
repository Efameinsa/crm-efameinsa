"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { cambiarMiClave } from "@/lib/acciones/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Cualquiera puede cambiar su contraseña desde su propio encabezado. Existe
// porque el alta de usuarios entrega una clave temporal: si no hay dónde
// cambiarla, esa clave termina anotada en un papel.
export function CambiarClave() {
  const [abierto, setAbierto] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [enviando, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await cambiarMiClave(formData);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Contraseña cambiada");
      formRef.current?.reset();
      setAbierto(false);
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" title="Cambiar mi contraseña">
            <KeyRound className="size-4" />
            Contraseña
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar mi contraseña</DialogTitle>
          <DialogDescription>
            Se le pide la actual para confirmar que es usted quien está delante del equipo.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="actual">Contraseña actual</Label>
            <Input id="actual" name="actual" type="password" autoComplete="current-password" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nueva">Nueva contraseña</Label>
            <Input id="nueva" name="nueva" type="password" autoComplete="new-password" minLength={8} required />
            <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Cambiando…" : "Cambiar contraseña"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
