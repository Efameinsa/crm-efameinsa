"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, Plus, TriangleAlert, X } from "lucide-react";
import { activarItemLista, agregarItemLista, renombrarItemLista } from "@/lib/acciones/listas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Una de las listas que el CRM pone en sus desplegables.
 *
 * TRES COSAS QUE LA TABLA VIEJA NO DECÍA, y por las que la pantalla no se
 * entendía:
 *
 *   · CUÁNTO SE USA CADA UNA. Es el único dato que permite decidir algo. «Otro»
 *     con 1.550 clientes encima no es una opción más de la lista: es la señal de
 *     que faltan rubros.
 *   · CUÁLES SIGUEN VIGENTES. Los retirados se dibujaban igual que los vivos, y
 *     por eso «Compra a futuro» parecía estar dos veces —uno está retirado desde
 *     hace rato y el comercial no lo ve—.
 *   · QUE SE PUEDEN CAMBIAR. Eran de solo lectura, así que la pantalla no
 *     servía ni para mirar ni para hacer.
 */

export interface ItemLista {
  id: string;
  codigo: string | null;
  nombre: string;
  activo: boolean;
  usos: number;
}

export function ListaDelSistema({
  lista,
  titulo,
  paraQue,
  items,
}: {
  lista: "rubros" | "motivos" | "resultados";
  titulo: string;
  /** Una línea: cuándo se elige esto y quién lo elige. */
  paraQue: string;
  items: ItemLista[];
}) {
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  const vigentes = items.filter((i) => i.activo).sort((a, b) => b.usos - a.usos);
  const retirados = items.filter((i) => !i.activo).sort((a, b) => b.usos - a.usos);

  // Dos vigentes con el mismo nombre son una trampa para quien elige del
  // desplegable: no hay forma de saber cuál es cuál.
  const repetidos = new Set(
    vigentes.map((i) => i.nombre.trim().toLowerCase()).filter((n, idx, todos) => todos.indexOf(n) !== idx),
  );

  function agregar() {
    empezar(async () => {
      const r = await agregarItemLista(lista, nuevo);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(`«${nuevo.trim()}» ya está en la lista.`);
      setNuevo("");
      setAgregando(false);
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">{titulo}</h2>
        <span className="text-[11px] text-muted-foreground">{vigentes.length} en uso</span>
      </div>
      <p className="mt-0.5 max-w-prose text-xs leading-snug text-muted-foreground">{paraQue}</p>

      <ul className="mt-3 space-y-1">
        {vigentes.map((i) => (
          <Fila key={i.id} lista={lista} item={i} repetido={repetidos.has(i.nombre.trim().toLowerCase())} />
        ))}
      </ul>

      {agregando ? (
        <div className="mt-2 flex gap-1.5">
          <Input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregar()}
            placeholder="Cómo se va a leer en el desplegable"
            autoFocus
          />
          <Button size="sm" onClick={agregar} disabled={enviando || nuevo.trim().length < 3}>
            Agregar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAgregando(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="mt-1.5" onClick={() => setAgregando(true)}>
          <Plus className="size-3.5" /> Agregar
        </Button>
      )}

      {retirados.length > 0 && (
        <details className="mt-3 border-t border-border pt-2">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Retirados ({retirados.length})
          </summary>
          <p className="mt-1 max-w-prose text-[11px] leading-snug text-muted-foreground">
            Ya no se ofrecen al elegir, pero siguen puestos en los registros viejos: por eso se retiran en vez de
            borrarse.
          </p>
          <ul className="mt-1.5 space-y-1">
            {retirados.map((i) => (
              <Fila key={i.id} lista={lista} item={i} repetido={false} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Fila({
  lista,
  item,
  repetido,
}: {
  lista: "rubros" | "motivos" | "resultados";
  item: ItemLista;
  repetido: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(item.nombre);
  const [enviando, empezar] = useTransition();
  const router = useRouter();

  function guardar() {
    empezar(async () => {
      const r = await renombrarItemLista(lista, item.id, nombre);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setEditando(false);
      router.refresh();
    });
  }

  function alternar() {
    empezar(async () => {
      const r = await activarItemLista(lista, item.id, !item.activo);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(item.activo ? `«${item.nombre}» ya no se va a ofrecer.` : `«${item.nombre}» vuelve a la lista.`);
      router.refresh();
    });
  }

  if (editando) {
    return (
      <li className="flex gap-1.5">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guardar()} autoFocus />
        <Button size="sm" onClick={guardar} disabled={enviando}>
          <Check className="size-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setNombre(item.nombre); setEditando(false); }}>
          <X className="size-3.5" />
        </Button>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "group flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1 hover:bg-accent/60",
        !item.activo && "opacity-60",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.nombre}</span>

      {repetido && (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700" title="Hay otra opción vigente que se llama igual">
          <TriangleAlert className="size-3" /> repetido
        </span>
      )}

      {/* El uso, que es lo que permite decidir. Sin esto, retirar algo es una
          apuesta: puede estar puesto en dos mil registros o en ninguno. */}
      <span
        className={cn(
          "w-24 text-right text-[11px] tabular-nums",
          item.usos === 0 ? "text-muted-foreground/60" : "text-muted-foreground",
        )}
      >
        {item.usos === 0 ? "sin usar" : `${item.usos.toLocaleString("es-PE")} ${item.usos === 1 ? "vez" : "veces"}`}
      </span>

      <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button size="sm" variant="ghost" onClick={() => setEditando(true)} disabled={enviando} title="Cambiar el nombre">
          <Pencil className="size-3" />
        </Button>
        <Button size="sm" variant="ghost" onClick={alternar} disabled={enviando}>
          {item.activo ? "Retirar" : "Reactivar"}
        </Button>
      </span>
    </li>
  );
}
