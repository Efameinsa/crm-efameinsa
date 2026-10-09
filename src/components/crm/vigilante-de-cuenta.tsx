"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * «OTRA CUENTA EN ESTE NAVEGADOR» (buzón, Ariana 09-10: «se cruzan los
 * usuarios de la aplicación y la página web, y no permite usar cuentas
 * diferentes»).
 *
 * POR QUÉ PASA. La sesión del CRM vive en una cookie de crm.efameinsa.com, y
 * el navegador guarda UNA por perfil: la ventana instalada «CRM Efameinsa» y
 * las pestañas de Chrome la comparten. Esa mañana, en la misma PC, se entró
 * como C4 y como C9 por turnos (08:44 a 08:52): cada ingreso pisaba la sesión
 * de la otra ventana, que seguía pintando a la persona anterior y en el
 * siguiente clic se rompía con «This page couldn't load».
 *
 * Dos cuentas a la vez en el mismo perfil no se pueden tener (es cómo funcionan
 * las cookies, no el CRM). Lo que sí se puede es que la ventana se dé cuenta y
 * lo diga con palabras: quién era, quién quedó, y cómo usar las dos a la vez
 * (otro navegador u otro perfil de Chrome).
 *
 * Cómo mira: lee la sesión del navegador (sin ir a la red) al volver el foco y
 * cada pocos segundos mientras la ventana está a la vista. Si no hay sesión no
 * dice nada: el siguiente clic ya lleva al ingreso.
 */
export function VigilanteDeCuenta({ userId, nombre }: { userId: string; nombre: string }) {
  const [otra, setOtra] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let viva = true;
    const revisar = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data } = await supabase.auth.getSession();
        const usuario = data.session?.user;
        if (viva && usuario && usuario.id !== userId) setOtra(usuario.email ?? "otra cuenta");
      } catch {
        /* sin sesión legible: no es este aviso quien lo resuelve */
      }
    };
    const cada = setInterval(revisar, 5000);
    window.addEventListener("focus", revisar);
    document.addEventListener("visibilitychange", revisar);
    return () => {
      viva = false;
      clearInterval(cada);
      window.removeEventListener("focus", revisar);
      document.removeEventListener("visibilitychange", revisar);
    };
  }, [userId]);

  if (!otra) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-background p-6 shadow-xl">
        <h2 className="text-lg font-bold text-foreground">En este navegador se entró con otra cuenta</h2>
        <p className="text-sm text-muted-foreground">
          Esta ventana era de <b className="text-foreground">{nombre}</b>, pero en otra pestaña o ventana del CRM se
          ingresó como <b className="text-foreground">{otra}</b>. El navegador guarda una sola cuenta del CRM a la vez:
          la ventana instalada y las pestañas la comparten.
        </p>
        <p className="text-sm text-muted-foreground">
          Para tener dos cuentas abiertas a la vez, abra la segunda en otro navegador (por ejemplo, Microsoft Edge) o en
          otro perfil de Chrome.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full cursor-pointer rounded-md bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
        >
          Seguir como {otra}
        </button>
      </div>
    </div>
  );
}
