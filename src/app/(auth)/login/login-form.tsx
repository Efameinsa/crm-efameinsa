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
      <div className="flex flex-col items-center gap-2 pb-7 text-center">
        <Image
          src="/logo-efameinsa-transparente.png"
          alt="Efameinsa"
          width={230}
          height={37}
          priority
          className="h-11 w-auto"
        />
        <p className="text-sm text-white/60">CRM comercial</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-7 shadow-2xl backdrop-blur-sm">
        <form action={accion} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-white/80">
              Correo
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className="border-white/15 bg-white/[0.06] text-white placeholder:text-white/30 focus-visible:border-[var(--efameinsa-granate)] focus-visible:ring-[var(--efameinsa-granate)]/40"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-white/80">
              Contraseña
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="border-white/15 bg-white/[0.06] text-white placeholder:text-white/30 focus-visible:border-[var(--efameinsa-granate)] focus-visible:ring-[var(--efameinsa-granate)]/40"
            />
          </div>
          {estado.error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-red-300"
            >
              {estado.error}
            </motion.p>
          )}
          <Button
            type="submit"
            className="w-full bg-[var(--efameinsa-granate)] text-white hover:bg-[var(--efameinsa-granate)]/90"
            disabled={enviando}
          >
            {enviando ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>
      </div>
    </motion.div>
  );
}
