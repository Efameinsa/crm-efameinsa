"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore } from "lucide-react";
import { archivarFicha, restaurarFicha } from "@/lib/acciones/registro";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface FichaSuelta {
  id: string;
  razon_social: string | null;
  tipo_doc: string | null;
  num_doc: string | null;
  comercial: string | null;
  creada: string | null;
  contactos: number;
  notas: string | null;
  archivada_at: string | null;
  archivada_por: string | null;
  archivada_motivo: string | null;
}

const MOTIVOS = ["Duplicada, sin datos", "Proveedor o no es cliente", "Ficha de prueba", "Sin datos para contactar"];

/**
 * FICHAS SUELTAS (0513, Santos 16-10: «que también pueda archivar las fichas
 * que están huérfanas o solas»). Se eligen una o varias y se archivan con un
 * motivo; las archivadas se restauran con un clic. Si una suelta es en
 * realidad un duplicado de otra con historia, lo correcto es unirla desde su
 * ficha («¿Es el mismo cliente?»), no archivarla.
 */
export function ListaFichasSueltas({ fichas, archivadas }: { fichas: FichaSuelta[]; archivadas: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [problema, setProblema] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (!q) return fichas;
    return fichas.filter((f) => `${f.razon_social ?? ""} ${f.num_doc ?? ""} ${f.comercial ?? ""}`.toLowerCase().includes(q));
  }, [fichas, texto]);

  const alternar = (id: string) =>
    setElegidas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todasVisibles = visibles.length > 0 && visibles.every((f) => elegidas.has(f.id));

  function archivar() {
    if (motivo.trim().length < 5) return;
    setProblema(null);
    startTransition(async () => {
      let hechas = 0;
      const fallas: string[] = [];
      for (const id of elegidas) {
        const r = await archivarFicha(id, motivo);
        if (r.error) fallas.push(r.error);
        else hechas++;
      }
      if (fallas.length) {
        setProblema(`${hechas ? `Se archivaron ${hechas}. ` : ""}No se pudieron archivar ${fallas.length}: ${fallas[0]}`);
      } else {
        toast.success(`${hechas === 1 ? "Ficha archivada" : `${hechas} fichas archivadas`}. Se restauran desde «Archivadas».`);
        setAbierto(false);
      }
      setElegidas(new Set());
      router.refresh();
    });
  }

  function restaurar(id: string) {
    startTransition(async () => {
      const r = await restaurarFicha(id);
      if (r.error) toast.error(r.error, { duration: 8000 });
      else toast.success(r.resumen ?? "Ficha restaurada");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por nombre, RUC o cartera"
          className="h-9 min-w-56 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        {!archivadas && (
          <Button
            size="sm"
            className="gap-1.5"
            disabled={elegidas.size === 0}
            onClick={() => {
              setMotivo("");
              setProblema(null);
              setAbierto(true);
            }}
          >
            <Archive className="size-3.5" />
            {elegidas.size ? `Archivar ${elegidas.size === 1 ? "la ficha elegida" : `las ${elegidas.size} elegidas`}` : "Archivar"}
          </Button>
        )}
      </div>
      {!archivadas && elegidas.size === 0 && (
        <p className="text-[11px] text-muted-foreground">Marque una o varias fichas para archivarlas.</p>
      )}

      {visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {fichas.length === 0
            ? archivadas
              ? "No hay fichas archivadas."
              : "No hay fichas sueltas: todas tienen algún expediente, caso, máquina o cotización."
            : "Ninguna ficha coincide con esa búsqueda."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {!archivadas && (
            <li className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-4"
                checked={todasVisibles}
                onChange={() =>
                  setElegidas((s) => {
                    const n = new Set(s);
                    for (const f of visibles) {
                      if (todasVisibles) n.delete(f.id);
                      else n.add(f.id);
                    }
                    return n;
                  })
                }
                aria-label="Elegir todas las que se ven"
              />
              {todasVisibles ? "Quitar todas" : `Elegir las ${visibles.length} que se ven`}
            </li>
          )}
          {visibles.map((f) => (
            <li key={f.id} className={cn("flex items-start gap-2 px-3 py-2.5", elegidas.has(f.id) && "bg-primary/5")}>
              {!archivadas && (
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={elegidas.has(f.id)}
                  onChange={() => alternar(f.id)}
                  aria-label={`Elegir ${f.razon_social ?? "ficha sin nombre"}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <Link href={`/comercial/cartera/${f.id}`} className="text-sm font-medium text-foreground hover:underline">
                  {f.razon_social || "(sin razón social)"}
                </Link>
                <p className="text-[11px] text-muted-foreground">
                  {f.num_doc && f.tipo_doc !== "SIN_DOC" ? `${f.tipo_doc} ${f.num_doc}` : "Sin RUC"}
                  {f.comercial ? ` · cartera de ${f.comercial}` : " · sin cartera"}
                  {f.creada ? ` · creada el ${f.creada.split("-").reverse().join("/")}` : ""}
                  {` · ${f.contactos} contacto${f.contactos === 1 ? "" : "s"}`}
                </p>
                {f.notas && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{f.notas}</p>}
                {archivadas && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Archivada{f.archivada_por ? ` por ${f.archivada_por}` : ""}
                    {f.archivada_motivo ? ` — «${f.archivada_motivo}»` : ""}
                  </p>
                )}
              </div>
              {archivadas && (
                <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-xs" disabled={enviando} onClick={() => restaurar(f.id)}>
                  <ArchiveRestore className="size-3.5" /> Restaurar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archivar {elegidas.size === 1 ? "la ficha" : `${elegidas.size} fichas`}</DialogTitle>
            <DialogDescription>
              Salen de las listas de clientes, pero no se borran. Si alguna vuelve a tener un expediente, un caso o un prospecto,
              vuelve sola. Si es el duplicado de una ficha con historia, mejor únala desde su ficha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-archivo">Por qué se archivan</Label>
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotivo(m)}
                  className={cn(
                    "cursor-pointer rounded-full border px-2.5 py-1 text-xs",
                    motivo === m ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <Textarea id="motivo-archivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="O escríbalo" />
          </div>
          {problema && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs leading-snug text-destructive">
              {problema}
            </p>
          )}
          <DialogFooter className="sm:flex-col sm:items-stretch sm:gap-2">
            {motivo.trim().length < 5 && <p className="text-[11px] text-muted-foreground">Elija o escriba el motivo.</p>}
            <Button onClick={archivar} disabled={motivo.trim().length < 5 || enviando}>
              {enviando ? "Archivando…" : "Archivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
