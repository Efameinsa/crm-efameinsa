"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Las sugerencias del campo «técnico»: la relación de técnicos de la empresa
 * (0410, Lesly 06-10). Se enchufa con `list={ID_LISTA_TECNICOS}` en el input.
 * Sigue siendo texto libre: un tercero contratado para una visita se escribe
 * igual (ver tecnicosConocidos en lib/tecnicos.ts).
 */
export const ID_LISTA_TECNICOS = "tecnicos-empresa";

let cache: { nombre: string; dni: string | null }[] | null = null;

export function ListaTecnicos() {
  const [tecnicos, setTecnicos] = useState(cache ?? []);
  useEffect(() => {
    if (cache) return;
    let vivo = true;
    createClient()
      .from("tecnicos")
      .select("nombre, dni")
      .eq("activo", true)
      .order("orden")
      .then(({ data }) => {
        cache = (data ?? []) as { nombre: string; dni: string | null }[];
        if (vivo) setTecnicos(cache);
      });
    return () => {
      vivo = false;
    };
  }, []);
  return (
    <datalist id={ID_LISTA_TECNICOS}>
      {tecnicos.map((t) => (
        <option key={t.nombre} value={t.nombre}>
          {t.dni ? `DNI ${t.dni}` : undefined}
        </option>
      ))}
    </datalist>
  );
}
