"use client";

import { useEffect, useState } from "react";
import Link from "@/components/enlace";
import { History, X } from "lucide-react";

/**
 * LOS ÚLTIMOS CLIENTES QUE ABRIÓ, A UN CLIC (gerencia, 28-09). Rubí volvía a la
 * lista y tenía que escribir otra vez el nombre del cliente que acababa de ver;
 * Carlos: «no entiendo por qué cada rato está digitando… ahí deben salir las
 * búsquedas automáticas arriba… o al menos tus últimas 10 búsquedas que tú
 * mismo has hecho». Se guarda en este navegador (es de quien usa la
 * computadora, no del cliente) y se anota cada vez que se abre una ficha.
 */
const CLAVE = "crm:clientes-recientes";
const MAXIMO = 10;

interface Reciente {
  id: string;
  nombre: string;
}

function leer(): Reciente[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string" && typeof x.nombre === "string").slice(0, MAXIMO) : [];
  } catch {
    return [];
  }
}

function guardar(lista: Reciente[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, MAXIMO)));
  } catch {
    // modo privado o almacenamiento bloqueado: sin recientes, nada más
  }
}

/** Va en la ficha del cliente: la anota al principio de la lista. */
export function AnotarClienteReciente({ id, nombre }: { id: string; nombre: string }) {
  useEffect(() => {
    guardar([{ id, nombre }, ...leer().filter((r) => r.id !== id)]);
  }, [id, nombre]);
  return null;
}

/** Va debajo del buscador de clientes. */
export function ClientesRecientes({ base = "/comercial/cartera" }: { base?: string }) {
  const [lista, setLista] = useState<Reciente[]>([]);
  useEffect(() => {
    // Solo existe en el navegador.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLista(leer());
  }, []);
  if (lista.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <History className="size-3.5" /> Abiertos hace poco:
      </span>
      {lista.map((r) => (
        <span key={r.id} className="inline-flex items-center rounded-full border border-border bg-card">
          <Link href={`${base}/${r.id}`} className="max-w-[16rem] truncate py-0.5 pl-2 pr-1 font-medium text-foreground hover:text-primary" title={r.nombre}>
            {r.nombre}
          </Link>
          <button
            type="button"
            aria-label={`Quitar ${r.nombre} de los recientes`}
            onClick={() => {
              const nueva = lista.filter((x) => x.id !== r.id);
              guardar(nueva);
              setLista(nueva);
            }}
            className="rounded-full p-0.5 pr-1.5 text-muted-foreground hover:text-destructive"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
