"use client";

import { cn } from "@/lib/utils";

// Desplegable «Rubro» de la cartera (pedido del ing. Carlos, 01-09: «hoy me
// voy a centrar en mineras… que me permita filtrar por rubros»).
//
// Cada opción dice cuántos CLIENTES de la cartera tiene ese rubro, y la última
// —«Sin rubro»— cuántos faltan clasificar. Ese número va a propósito: al 01-09
// solo el 30 % de las cuentas tiene rubro, y sin verlo el comercial leería
// «Minería (3)» como «tengo 3 mineras» cuando en realidad tiene 300 clientes
// sin clasificar entre los que puede haber más.
//
// Funciona de dos maneras, según la pantalla:
// - con `onCambiar`: avisa y la pantalla navega (Mis oportunidades, donde
//   todos los filtros viven en la URL);
// - sin `onCambiar`: es un campo del formulario que lo envuelve (Mi cartera,
//   que busca con un formulario GET) y lo envía solo al cambiar.

export type ValorRubro = number | "sin";

export interface OpcionRubro {
  id: number;
  nombre: string;
  /** Clientes de la cartera con ese rubro. */
  clientes: number;
}

export function FiltroRubro({
  valor,
  opciones,
  sinRubro,
  onCambiar,
  name = "rubro",
  className,
}: {
  valor: ValorRubro | null;
  opciones: OpcionRubro[];
  sinRubro: number;
  onCambiar?: (valor: string | null) => void;
  name?: string;
  className?: string;
}) {
  const n = (x: number) => x.toLocaleString("es-PE");
  const actual = valor === null ? "" : String(valor);
  return (
    <label className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      Rubro:
      <select
        name={name}
        aria-label="Filtrar por rubro"
        title="Clientes de su cartera por rubro. «Sin rubro» son los que todavía no tienen rubro puesto en su ficha."
        className={cn(
          "h-8 cursor-pointer rounded-md border border-input bg-background px-2 text-xs",
          valor !== null ? "border-primary font-semibold text-primary" : "text-foreground",
        )}
        {...(onCambiar
          ? { value: actual, onChange: (e) => onCambiar(e.target.value || null) }
          : { defaultValue: actual, onChange: (e) => e.currentTarget.form?.requestSubmit() })}
      >
        <option value="">Todos los rubros</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre} ({n(o.clientes)})
          </option>
        ))}
        <option value="sin">Sin rubro ({n(sinRubro)})</option>
      </select>
    </label>
  );
}
