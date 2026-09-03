"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tag, Pencil, Check, X, Plus } from "lucide-react";
import { cambiarRubroCuenta, agregarRubroYAsignar } from "@/lib/acciones/cuentas";
import { cn } from "@/lib/utils";

/**
 * El rubro del cliente, a la vista y con «Cambiar rubro» al lado.
 *
 * Carlos, 02-09: «que muestre si ya está en qué rubro está, y diga: este es
 * hotel, pero esto es una textil. Cambiar rubro o agregar rubro, cualquiera
 * de los dos, pero que te avise en qué rubro está». Sin código: es la propia
 * cartera del gestor y clasificar bien le mejora su propio filtro.
 *
 * Santos, 03-09: «los comerciales deben de poder agregar rubros». El
 * desplegable termina en «＋ Agregar un rubro nuevo…»: al elegirlo aparece una
 * casilla, se escribe el rubro y con Guardar queda en la lista para todos y
 * puesto en este cliente, en un solo paso. Mientras se escribe, si ya hay uno
 * parecido en la lista se ofrece ese antes, para no fabricar «Mineria» al lado
 * de «Minería / Campamento».
 *
 * Vive en la cabecera de la oportunidad y en la ficha del cliente, que es
 * donde el gestor está mirando cuando se da cuenta de que el rubro está mal.
 */

const NUEVO = "__nuevo";

/** Sin tildes ni mayúsculas, para comparar lo escrito con la lista. */
function clave(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function CambiarRubro({
  cuentaId,
  rubroId,
  rubros,
  compacto = false,
}: {
  cuentaId: string;
  rubroId: number | null;
  rubros: { id: number; nombre: string }[];
  compacto?: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(rubroId === null ? "" : String(rubroId));
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [guardando, empezar] = useTransition();
  const actual = rubros.find((r) => r.id === rubroId)?.nombre ?? null;
  const esOtro = /^otro/i.test(actual ?? "");
  const escribiendo = valor === NUEVO;

  // El parecido que ya está en la lista, si lo hay: mismo texto sin tildes, o
  // uno contiene al otro («miner» → «Minería / Campamento»).
  const claveNueva = clave(nombreNuevo);
  const parecido =
    claveNueva.length >= 3
      ? rubros.find((r) => {
          const c = clave(r.nombre);
          return c === claveNueva || c.includes(claveNueva) || claveNueva.includes(c);
        })
      : undefined;

  function cerrar() {
    setValor(rubroId === null ? "" : String(rubroId));
    setNombreNuevo("");
    setEditando(false);
  }

  function guardarElegido(id: number | null) {
    if (id === rubroId) {
      cerrar();
      return;
    }
    empezar(async () => {
      const r = await cambiarRubroCuenta(cuentaId, id);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(id === null ? "Rubro quitado" : `Rubro: ${rubros.find((x) => x.id === id)?.nombre}`);
      cerrar();
      router.refresh();
    });
  }

  function guardarNuevo() {
    const limpio = nombreNuevo.replace(/\s+/g, " ").trim();
    if (limpio.length < 3) {
      toast.error("El rubro necesita al menos tres letras");
      return;
    }
    empezar(async () => {
      const r = await agregarRubroYAsignar(cuentaId, limpio);
      if (r.error || !r.rubro) {
        toast.error(r.error ?? "No se pudo agregar el rubro");
        return;
      }
      if (r.nuevo) {
        toast.success(`«${r.rubro.nombre}» ya está en la lista de rubros y puesto en este cliente. Los demás también lo van a ver.`);
      } else if (r.reactivado) {
        toast.success(`«${r.rubro.nombre}» estaba retirado de la lista: vuelve, y queda puesto en este cliente.`);
      } else {
        toast.success(`«${r.rubro.nombre}» ya estaba en la lista; se lo puse a este cliente.`);
      }
      cerrar();
      router.refresh();
    });
  }

  function guardar() {
    if (escribiendo) guardarNuevo();
    else guardarElegido(valor === "" ? null : Number(valor));
  }

  if (editando) {
    return (
      <span className="inline-flex flex-col gap-1.5">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Tag className="size-3.5 text-muted-foreground" />
          {escribiendo ? (
            <input
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  guardarNuevo();
                }
                if (e.key === "Escape") cerrar();
              }}
              maxLength={40}
              autoFocus
              placeholder="Escriba el rubro nuevo (ej. Agroindustria)"
              aria-label="Rubro nuevo"
              className="h-7 w-56 rounded-md border border-input bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground/70"
            />
          ) : (
            <select
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              autoFocus
              className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              <option value="">Sin rubro</option>
              {rubros.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.nombre}
                </option>
              ))}
              <option value={NUEVO}>＋ Agregar un rubro nuevo…</option>
            </select>
          )}
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || (escribiendo && claveNueva.length < 3)}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {escribiendo ? <Plus className="size-3.5" /> : <Check className="size-3.5" />}
            {escribiendo ? "Agregar y poner" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={escribiendo ? () => { setValor(rubroId === null ? "" : String(rubroId)); setNombreNuevo(""); } : cerrar}
            className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-muted-foreground hover:text-foreground"
            aria-label={escribiendo ? "Volver a la lista" : "Cancelar"}
            title={escribiendo ? "Volver a la lista" : "Cancelar"}
          >
            <X className="size-3.5" />
          </button>
        </span>
        {escribiendo && (
          <span className="pl-5 text-[11px] leading-snug text-muted-foreground">
            {parecido ? (
              <>
                Ya hay uno parecido:{" "}
                <button
                  type="button"
                  onClick={() => guardarElegido(parecido.id)}
                  disabled={guardando}
                  className="font-semibold text-foreground underline decoration-dotted underline-offset-2 hover:text-primary"
                >
                  usar «{parecido.nombre}»
                </button>
              </>
            ) : (
              "Queda en la lista para todos los comerciales. Escríbalo como se va a leer."
            )}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Tag className="size-3.5 text-muted-foreground" />
      <span className={cn("text-xs", actual && !esOtro ? "text-foreground" : "font-medium text-amber-700")}>
        {actual ? (esOtro ? `Rubro: ${actual} (revisar)` : `Rubro: ${actual}`) : "Sin rubro"}
      </span>
      <button
        type="button"
        onClick={() => setEditando(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors",
          actual && !esOtro
            ? "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            : "border-amber-500/60 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20",
        )}
        title={
          actual
            ? "Cambiar el rubro de este cliente, o agregar uno nuevo a la lista"
            : "Póngale rubro: es con lo que se filtra la cartera por sector. Si no está en la lista, se agrega ahí mismo."
        }
      >
        <Pencil className="size-3" /> {actual ? "Cambiar rubro" : "Agregar rubro"}
      </button>
      {compacto ? null : null}
    </span>
  );
}
