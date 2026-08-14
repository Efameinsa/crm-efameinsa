"use client";

import { useActionState } from "react";
import { iniciarSesion } from "@/lib/acciones/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [estado, accion, enviando] = useActionState(iniciarSesion, { error: null });

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={accion} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {estado.error && <p className="text-sm text-destructive">{estado.error}</p>}
          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
