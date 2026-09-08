"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * UNA SOLA CAJA PARA AGREGAR.
 *
 * Postventa tenía tres puertas para lo mismo: un botón «Agregar un servicio o
 * repuesto», un buscador de servicios que estaba vacío a propósito, y un
 * plegable con el catálogo de equipos (informe de UX del 08-09). Tres formas
 * de hacer lo mismo obligan a elegir antes de empezar, y quien no conoce la
 * pantalla elige mal.
 *
 * Acá se escribe QUÉ se va a cotizar y la caja hace las dos cosas a la vez:
 * busca en el catálogo —servicios, repuestos y máquinas, desde la 0190 conviven
 * ahí— y, si no aparece, ofrece agregar eso mismo escrito a mano con el texto
 * que ya se tipeó. Sin decidir de antemano por cuál de las tres se entra.
 *
 * El texto libre no es un parche: el catálogo de repuestos se está armando con
 * las fichas de Lesly, y hasta que esté, escribir a mano es el camino normal
 * del área, no la excepción.
 */

export interface ItemDelCatalogo {
  id: string;
  sku: string | null;
  marca: string | null;
  modelo: string | null;
  nombre: string | null;
  capacidad: string | null;
  segmento: string | null;
  precio?: number | null;
}

/** Cómo se llama cada familia cuando se la muestra al que cotiza. */
const ETIQUETA_SEGMENTO: Record<string, string> = {
  servicio: "Servicio",
  repuesto: "Repuesto",
  industrial: "Máquina",
  semi_industrial: "Máquina",
};

const sinTildes = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-PE");

export function CajaAgregarItem({
  productos,
  enCarrito,
  onAgregar,
  onLineaLibre,
  moneda,
}: {
  productos: ItemDelCatalogo[];
  /** Cuántas unidades de cada uno ya están en la cotización. */
  enCarrito: Record<string, number>;
  onAgregar: (id: string) => void;
  /** Agrega una línea escrita a mano con el texto tipeado. */
  onLineaLibre: (texto: string) => void;
  moneda: string;
}) {
  const [texto, setTexto] = useState("");
  const buscado = texto.trim();

  const resultados = useMemo(() => {
    if (buscado.length < 2) return [];
    const q = sinTildes(buscado);
    return productos
      .filter((p) =>
        sinTildes([p.nombre, p.marca, p.modelo, p.sku, p.capacidad].filter(Boolean).join(" ")).includes(q),
      )
      .slice(0, 8);
  }, [buscado, productos]);

  function agregarAMano() {
    onLineaLibre(buscado);
    setTexto("");
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-xs font-semibold text-foreground">¿Qué va a cotizar?</p>
      <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
        El mantenimiento, el repuesto, el servicio o la máquina. Se busca en el catálogo mientras escribe; lo que no
        esté, se agrega tal como lo escribió.
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter con algo escrito y sin resultados: se agrega a mano. Es el
            // gesto que ya hace todo el mundo sin pensarlo.
            if (e.key === "Enter" && buscado.length >= 2 && resultados.length === 0) {
              e.preventDefault();
              agregarAMano();
            }
          }}
          placeholder="Mantenimiento preventivo, bomba de desagüe, LAV180…"
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none"
        />
      </div>

      {buscado.length >= 2 && (
        <div className="mt-2 space-y-1">
          {resultados.map((p) => {
            const yaEsta = (enCarrito[p.id] ?? 0) > 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onAgregar(p.id);
                  setTexto("");
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                  yaEsta ? "border-primary/40 bg-primary/10" : "border-border bg-background hover:bg-accent",
                )}
              >
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {ETIQUETA_SEGMENTO[String(p.segmento)] ?? "Ítem"}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {[p.marca, p.modelo, p.nombre].filter(Boolean).join(" · ")}
                </span>
                {p.precio != null && p.precio > 0 && (
                  <span className="flex-none tabular-nums text-muted-foreground">
                    {moneda} {p.precio.toLocaleString("es-PE")}
                  </span>
                )}
                {yaEsta && <span className="flex-none font-semibold text-primary">ya está ({enCarrito[p.id]})</span>}
              </button>
            );
          })}

          {/* Siempre disponible, haya resultados o no: el catálogo de repuestos
              todavía se está armando y escribir a mano es el camino normal. */}
          <button
            type="button"
            onClick={agregarAMano}
            className="flex w-full cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-primary/40 px-2.5 py-1.5 text-left text-xs font-semibold text-primary hover:bg-primary/10"
          >
            <Plus className="size-3.5 flex-none" />
            Agregar «{buscado}» escrito a mano
          </button>
        </div>
      )}
    </div>
  );
}
