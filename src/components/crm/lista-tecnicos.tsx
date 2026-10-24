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

type Tecnico = { nombre: string; dni: string | null };
let cache: Tecnico[] | null = null;

function useTecnicos() {
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
        cache = (data ?? []) as Tecnico[];
        if (vivo) setTecnicos(cache);
      });
    return () => {
      vivo = false;
    };
  }, []);
  return tecnicos;
}

export function ListaTecnicos() {
  const tecnicos = useTecnicos();
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

const OTRO = "__otro__";

/**
 * El técnico de los protocolos (Santos, 24-10): se elige de la lista y, si no
 * figura, «Otro» abre un campo para escribir nombre y apellido. Lo escrito se
 * guarda igual que antes (texto), hasta tener una solución mejor para los
 * técnicos que no están en la relación.
 */
export function ElegirTecnico({
  value,
  onChange,
  claseCampo = "",
  className = "",
}: {
  value: string;
  onChange: (nombre: string) => void;
  /** Clases del desplegable y del campo de texto (alto, borde, letra). */
  claseCampo?: string;
  className?: string;
}) {
  const tecnicos = useTecnicos();
  const [otro, setOtro] = useState(false);
  const enLista = tecnicos.some((t) => t.nombre === value);
  const escribiendo = otro || (value.trim() !== "" && !enLista);
  return (
    <span className={`flex flex-wrap items-center gap-1 ${className}`}>
      <select
        value={escribiendo ? OTRO : value}
        onChange={(x) => {
          if (x.target.value === OTRO) {
            setOtro(true);
            if (enLista) onChange("");
          } else {
            setOtro(false);
            onChange(x.target.value);
          }
        }}
        className={`min-w-0 flex-1 rounded-md border border-input bg-background px-2 ${claseCampo}`}
      >
        <option value="">Elegir técnico…</option>
        {tecnicos.map((t) => (
          <option key={t.nombre} value={t.nombre}>
            {t.nombre}
          </option>
        ))}
        <option value={OTRO}>Otro: escribir nombre y apellido…</option>
      </select>
      {escribiendo && (
        <input
          autoFocus={otro}
          value={value}
          onChange={(x) => onChange(x.target.value)}
          placeholder="Nombre y apellido del técnico"
          maxLength={120}
          className={`min-w-0 flex-1 rounded-md border border-input bg-background px-2 ${claseCampo}`}
        />
      )}
    </span>
  );
}
