"use client";

// LO ÚLTIMO QUE BUSCÓ, PRIMERO (reunión con el ingeniero y Lesly, 23-10 15:59:
// «en el buscador, que siempre aparezca el último que has buscado… una historia
// de lo que ella buscó y que aparezca el último primero»). Se guarda en el
// navegador de cada persona (localStorage): no es dato del CRM y no se comparte.

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { History } from "lucide-react";

const CLAVE = "crm.busquedas";
const MAXIMO = 8;

// Un almacén mínimo sobre localStorage para leerlo con useSyncExternalStore
// (sin setState dentro de efectos): la instantánea es el texto guardado.
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());
function suscribir(f: () => void) {
  oyentes.add(f);
  window.addEventListener("storage", f);
  return () => {
    oyentes.delete(f);
    window.removeEventListener("storage", f);
  };
}
function instantanea(): string {
  try {
    return localStorage.getItem(CLAVE) ?? "[]";
  } catch {
    return "[]";
  }
}
const vacia = () => "[]";
function parsear(texto: string): string[] {
  try {
    const v = JSON.parse(texto);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function leerBusquedas(): string[] {
  return parsear(instantanea());
}

export function recordarBusqueda(q: string): string[] {
  const t = q.trim();
  const lista = [t, ...leerBusquedas().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAXIMO);
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento (ventana privada): no se recuerda */
  }
  avisar();
  return lista;
}

/** Fichas con las últimas búsquedas, la más reciente primero. Si `actual` viene, la anota. */
export function UltimasBusquedas({ actual }: { actual?: string }) {
  const lista = parsear(useSyncExternalStore(suscribir, instantanea, vacia));
  useEffect(() => {
    if (actual?.trim()) recordarBusqueda(actual);
  }, [actual]);
  if (lista.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <History className="size-3.5" /> Últimas búsquedas:
      </span>
      {lista.map((q) => (
        <Link
          key={q}
          href={`/buscar?q=${encodeURIComponent(q)}`}
          className={q.toLowerCase() === actual?.trim().toLowerCase() ? "rounded-full border border-primary bg-primary/10 px-2 py-0.5 font-medium text-primary" : "rounded-full border border-border px-2 py-0.5 hover:bg-accent hover:text-foreground"}
        >
          {q}
        </Link>
      ))}
    </div>
  );
}

/** Las mismas búsquedas como sugerencias del buscador de arriba (la última primero). */
export function SugerenciasDeBusqueda({ id }: { id: string }) {
  const lista = parsear(useSyncExternalStore(suscribir, instantanea, vacia));
  return (
    <datalist id={id}>
      {lista.map((q) => (
        <option key={q} value={q} />
      ))}
    </datalist>
  );
}
