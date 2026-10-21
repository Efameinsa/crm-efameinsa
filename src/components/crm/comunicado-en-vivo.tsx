"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ComunicadoDeGerencia, type ComunicadoPendiente } from "@/components/crm/comunicado-de-gerencia";

const CADA_MS = 2 * 60 * 1000;

/**
 * EL COMUNICADO LE LLEGA TAMBIÉN A QUIEN YA TIENE EL CRM ABIERTO (Santos 21-10,
 * afiche del almuerzo: «si todos tienen sesión abierta igual que aparezca»).
 * El layout lo trae al entrar; si no había ninguno, cada 2 minutos (y al volver
 * a la pestaña) se pregunta si gerencia publicó uno. No recarga la pantalla:
 * solo abre la ventana encima de lo que la persona está haciendo.
 */
export function ComunicadoEnVivo({ inicial }: { inicial: ComunicadoPendiente | null }) {
  const [comunicado, setComunicado] = useState(inicial);

  useEffect(() => {
    if (comunicado) return;
    let vivo = true;
    const mirar = async () => {
      if (document.visibilityState !== "visible") return;
      const { data } = await createClient().rpc("comunicado_pendiente").maybeSingle();
      if (vivo && data) setComunicado(data as ComunicadoPendiente);
    };
    const t = setInterval(() => void mirar(), CADA_MS);
    document.addEventListener("visibilitychange", mirar);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", mirar);
    };
  }, [comunicado]);

  return comunicado ? <ComunicadoDeGerencia key={comunicado.id} comunicado={comunicado} /> : null;
}
