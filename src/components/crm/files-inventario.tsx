"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Check, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  buscarInventarioFiles,
  darDeBajaFileInventario,
  guardarFileInventario,
  type DatosFileInventario,
  type FileDelInventario,
} from "@/lib/acciones/files";
import { DatosDelFile } from "@/components/crm/files-acciones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * INVENTARIO DE FILES (0381). 02-10, Central: «ella también debería poder
 * agregarlos por el sistema para no estar dándome a mí las actualizaciones».
 * Rubí no encontraba PRODECO DEL SUR para pedir: era un cierre nuevo y el
 * inventario (0372) solo tenía lo del Excel al 23-09. Quien lleva el
 * archivador agrega el file nuevo, lo cambia de estante o cajón y lo da de
 * baja cuando ya no está; lo que guarda sale al instante en «Pedir files».
 */

// Como están rotulados en el archivador (inventario al 23-09-2026).
const ESTANTES = ["PRIMERO", "SEGUNDO", "TERCERO", "CUARTO", "QUINTO", "SEXTO", "SETIMO", "OCTAVO", "NOVENO", "DECIMO", "AF 1", "AF 2", "AF 3", "AFI"];
const CAJONES = ["PRIMER CAJÓN", "SEGUNDO CAJÓN", "TERCER CAJÓN", "CUARTO CAJÓN", "QUINTO CAJÓN"];

type Borrador = { empresa: "" | DatosFileInventario["empresa"]; tipo: DatosFileInventario["tipo"]; nombre: string; anio: string; estante: string; cajon: string; documento: string };
const VACIO: Borrador = { empresa: "", tipo: "file", nombre: "", anio: String(new Date().getFullYear()), estante: "", cajon: "", documento: "" };
const desde = (f: FileDelInventario): Borrador => ({
  empresa: f.empresa,
  tipo: f.tipo,
  nombre: f.nombre,
  anio: f.anio ? String(f.anio) : "",
  estante: f.estante ?? "",
  cajon: f.cajon ?? "",
  documento: f.documento ?? "",
});

const campo = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function FormularioFile({ inicial, editando, onListo, onCancelar }: { inicial: Borrador; editando: string | null; onListo: (nombre: string) => void; onCancelar: () => void }) {
  const [b, setB] = useState<Borrador>(inicial);
  const [guardando, startTransition] = useTransition();
  const poner = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));

  function guardar() {
    if (!b.empresa) return void toast.error("Elija la empresa: EFAMEINSA u OPEN");
    if (b.nombre.trim().length < 3) return void toast.error("Escriba el nombre del cliente como figura en el file");
    const anio = b.anio.trim() ? Number(b.anio) : null;
    if (anio !== null && !Number.isInteger(anio)) return void toast.error("El año va en números, por ejemplo 2026");
    startTransition(async () => {
      const r = await guardarFileInventario(editando, {
        empresa: b.empresa as DatosFileInventario["empresa"],
        tipo: b.tipo,
        nombre: b.nombre,
        anio,
        estante: b.estante || null,
        cajon: b.cajon || null,
        documento: b.documento.trim() || null,
      });
      if (r.error) return void toast.error(r.error, { duration: 9000 });
      toast.success(editando ? "File corregido en el inventario" : "File agregado: ya se puede pedir");
      onListo(b.nombre.trim());
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm font-semibold text-foreground">{editando ? "Corregir file" : "Agregar file al inventario"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-2">
          Cliente, como figura en el file
          <Input value={b.nombre} onChange={(e) => poner("nombre", e.target.value)} placeholder="PRODECO DEL SUR E.I.R.L." autoFocus />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Empresa
          <select value={b.empresa} onChange={(e) => poner("empresa", e.target.value as Borrador["empresa"])} className={campo}>
            <option value="">Elija…</option>
            <option value="efameinsa">EFAMEINSA</option>
            <option value="open">OPEN</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Tipo
          <select value={b.tipo} onChange={(e) => poner("tipo", e.target.value as Borrador["tipo"])} className={campo}>
            <option value="file">File</option>
            <option value="archivador">Archivador</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Estante
          <select value={b.estante} onChange={(e) => poner("estante", e.target.value)} className={campo}>
            <option value="">Sin estante</option>
            {[...new Set([...ESTANTES, ...(b.estante ? [b.estante] : [])])].map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Cajón
          <select value={b.cajon} onChange={(e) => poner("cajon", e.target.value)} className={campo}>
            <option value="">Sin cajón</option>
            {[...new Set([...CAJONES, ...(b.cajon ? [b.cajon] : [])])].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Año (opcional)
          <Input value={b.anio} onChange={(e) => poner("anio", e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="2026" />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          RUC o DNI (opcional)
          <Input value={b.documento} onChange={(e) => poner("documento", e.target.value.replace(/\D/g, "").slice(0, 11))} inputMode="numeric" placeholder="Para enlazarlo con la ficha del cliente" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={guardar} disabled={guardando}>
          {guardando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {editando ? "Guardar cambios" : "Agregar al inventario"}
        </Button>
        <Button variant="ghost" onClick={onCancelar} disabled={guardando}>
          <X className="size-4" /> Cancelar
        </Button>
      </div>
    </div>
  );
}

export function InventarioFiles() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<FileDelInventario[]>([]);
  const [buscado, setBuscado] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [formulario, setFormulario] = useState<{ id: string | null; inicial: Borrador } | null>(null);
  const [bajando, startBaja] = useTransition();
  const turno = useRef(0);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function buscarYa(texto: string) {
    const mio = ++turno.current;
    if (texto.length < 3) {
      setResultados([]);
      setBuscado("");
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const r = await buscarInventarioFiles(texto);
    if (mio === turno.current) {
      setResultados(r);
      setBuscado(texto);
      setBuscando(false);
    }
  }

  function escribir(valor: string) {
    setQ(valor);
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => buscarYa(valor.trim()), 300);
  }

  // Después de guardar se muestra lo guardado, para que Central lo vea como lo verán al pedir.
  function listo(nombre: string) {
    setFormulario(null);
    setQ(nombre);
    void buscarYa(nombre);
    router.refresh();
  }

  function darDeBaja(f: FileDelInventario) {
    if (!window.confirm(`¿Dar de baja «${f.nombre}»? Deja de salir al pedir files. Úselo cuando el file ya no está en el archivador.`)) return;
    startBaja(async () => {
      const r = await darDeBajaFileInventario(f.id);
      if (r.error) return void toast.error(r.error, { duration: 9000 });
      toast.success("File dado de baja");
      setResultados((v) => v.filter((x) => x.id !== f.id));
    });
  }

  const sinResultados = !buscando && buscado !== "" && buscado === q.trim() && resultados.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => escribir(e.target.value)} placeholder="Buscar en el inventario por nombre o RUC" className="pl-9" />
          {buscando && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        {!formulario && (
          <Button onClick={() => setFormulario({ id: null, inicial: { ...VACIO, nombre: sinResultados ? q.trim().toUpperCase() : "" } })}>
            <Plus className="size-4" /> Agregar file
          </Button>
        )}
      </div>

      {formulario && <FormularioFile key={formulario.id ?? "nuevo"} inicial={formulario.inicial} editando={formulario.id} onListo={listo} onCancelar={() => setFormulario(null)} />}

      {sinResultados && !formulario && (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
          «{buscado}» no está en el inventario. Si el file está en el archivador, agréguelo con «Agregar file» y ya se podrá pedir.
        </p>
      )}

      {resultados.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {resultados.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <Archive className="size-4 flex-none text-primary" />
              <span className="min-w-[12rem] flex-1 space-y-0.5">
                <span className="block text-sm font-medium">{f.nombre}</span>
                <DatosDelFile f={f} />
              </span>
              <span className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setFormulario({ id: f.id, inicial: desde(f) })}>
                  <Pencil className="size-3.5" /> Corregir
                </Button>
                <Button size="sm" variant="ghost" onClick={() => darDeBaja(f)} disabled={bajando} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" /> Dar de baja
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
