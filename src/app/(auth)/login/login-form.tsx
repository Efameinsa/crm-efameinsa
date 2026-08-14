"use client";

import { useActionState } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import { iniciarSesion } from "@/lib/acciones/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [estado, accion, enviando] = useActionState(iniciarSesion, { error: null });

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative z-10 w-full max-w-sm"
    >
      <div className="flex flex-col items-center gap-3 pb-6 text-center">
        <Image
          src="/logo-efameinsa-listo.png"
          alt="Efameinsa"
          width={220}
          height={92}
          priority
          className="h-20 w-auto"
        />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--efameinsa-granate)]">
          CRM Comercial
        </span>
      </div>

      <div className="rounded-2xl border border-border bg-card p-7 shadow-xl">
        <form action={accion} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {estado.error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-destructive"
            >
              {estado.error}
            </motion.p>
          )}
          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>
      </div>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        Acceso exclusivo para personal autorizado de Efameinsa.
      </p>
    </motion.div>
  );
}
