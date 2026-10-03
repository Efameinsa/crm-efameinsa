"use client";

import { useEffect, useState } from "react";
import { cerrarSesion } from "@/lib/acciones/auth";

/**
 * EL FORMULARIO DE «SALIR», QUE SUELTA EL AVISO DE ESTE NAVEGADOR.
 *
 * Lesly, 02-10: entró a la cuenta del almacén en su equipo y le saltaban las
 * aprobaciones de gerencia. Santos: «veo notificaciones de algunos aunque ya
 * hayan cerrado sus cuentas». El aviso push se ata al NAVEGADOR (0139), no a
 * la sesión: al salir, la suscripción seguía a nombre de quien salió y el
 * equipo le seguía mostrando sus avisos a quien entrara después.
 *
 * Al salir se manda el endpoint de este navegador y la acción borra esa
 * suscripción antes de cerrar la sesión. Si el navegador no tiene push, el
 * campo va vacío y sale igual que siempre.
 */
export function FormularioSalir({ children }: { children: React.ReactNode }) {
  const [endpoint, setEndpoint] = useState("");
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setEndpoint(sub?.endpoint ?? ""))
      .catch(() => undefined);
  }, []);
  return (
    <form action={cerrarSesion}>
      <input type="hidden" name="push_endpoint" value={endpoint} />
      {children}
    </form>
  );
}
