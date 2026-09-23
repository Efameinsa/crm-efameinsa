"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { reasignarCarteraEnBloque } from "@/lib/acciones/cuentas";
import { tiempoSinVenta, type FiltroLiberables } from "@/lib/cartera-liberable";
import { fechaLima } from "@/lib/fechas";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReasignarCarteraBoton } from "@/components/crm/reasignar-cartera-boton";

interface Fila {
  id: string;
  razonSocial: string;
  numDoc: string | null;
  comercialId: string;
  comercial: { codigo: string | null; nombre: string } | null;
  ultimaVentaAt: string | null;
  sinVentaDesde: string | null;
}

interface Destino {
  id: string;
  nombre: string;
  codigo_comercial: string | null;
}

type Bloque = { modo: "marcados"; cantidad: number } | { modo: "filtrados"; cantidad: number };

/**
 * La lista de clientes liberables, con la reasignación de a uno (el mismo
 * botón de la ficha) y en bloque: los marcados, o todos los filtrados de un
 * comercial hasta el tope. El bloque siempre pasa por una confirmación que
 * dice cuántos, de quién y a quién, antes de mover nada.
 */
export function TablaCarteraLiberable({
  filas,
  ahora,
  destinos,
  filtro,
  comercialFiltrado,
  tope,
}: {
  filas: Fila[];
  ahora: number;
  destinos: Destino[];
  filtro: FiltroLiberables;
  comercialFiltrado: { id: string; etiqueta: string; total: number } | null;
  tope: number;
}) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [bloque, setBloque] = useState<Bloque | null>(null);
  const [destino, setDestino] = useState("");
  const [enviando, startTransition] = useTransition();

  const todosMarcados = filas.length > 0 && filas.every((f) => marcados.has(f.id));
  const alternar = (id: string) =>
    setMarcados((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  const alternarTodos = () => setMarcados(todosMarcados ? new Set() : new Set(filas.map((f) => f.id)));

  // De quién son los marcados, para decirlo en la confirmación.
  const duenosMarcados = new Map<string, number>();
  for (const f of filas) {
    if (!marcados.has(f.id)) continue;
    const etiqueta = f.comercial ? `${f.comercial.codigo ?? ""} ${f.comercial.nombre}`.trim() : "sin dueño conocido";
    duenosMarcados.set(etiqueta, (duenosMarcados.get(etiqueta) ?? 0) + 1);
  }
  const deQuien =
    bloque?.modo === "filtrados"
      ? comercialFiltrado?.etiqueta ?? ""
      : [...duenosMarcados].map(([e, n]) => `${e} (${n})`).join(", ");

  // No se ofrece pasarle a un comercial sus propios clientes.
  const origenUnico = bloque?.modo === "filtrados" ? comercialFiltrado?.id : null;
  const opciones = destinos.filter((d) => d.id !== origenUnico);
  const elegido = opciones.find((d) => d.id === destino);
  const cantidadFiltrados = comercialFiltrado ? Math.min(comercialFiltrado.total, tope) : 0;

  function abrir(b: Bloque) {
    setDestino("");
    setBloque(b);
  }

  function confirmar() {
    if (!bloque || !destino) return;
    startTransition(async () => {
      const r = await reasignarCarteraEnBloque(
        bloque.modo === "marcados" ? { destino, cuentaIds: [...marcados] } : { destino, filtro },
      );
      if (r.error) {
        toast.error(r.error, { duration: 8000 });
        return;
      }
      const quien = `${elegido?.codigo_comercial ?? ""} ${elegido?.nombre ?? ""}`.trim();
      toast.success(
        `${r.movidos} ${r.movidos === 1 ? "cliente pasó" : "clientes pasaron"} a ${quien}` +
          (r.oportunidades ? `, con ${r.oportunidades} oportunidad(es) abierta(s)` : "") +
          ". Cada comercial recibió un solo aviso.",
        { duration: 8000 },
      );
      if (r.fallidos && r.fallidos.length > 0) {
        toast.warning(
          `${r.fallidos.length} no se movieron: ` +
            r.fallidos
              .slice(0, 3)
              .map((f) => `${f.razonSocial} (${f.motivo})`)
              .join("; ") +
            (r.fallidos.length > 3 ? "…" : ""),
          { duration: 12000 },
        );
      }
      setBloque(null);
      setMarcados(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          {marcados.size === 0
            ? "Marque clientes para pasarlos juntos a otro comercial."
            : `${marcados.size} ${marcados.size === 1 ? "cliente marcado" : "clientes marcados"}.`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {marcados.size > 0 && (
            <Button size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => abrir({ modo: "marcados", cantidad: marcados.size })}>
              <ArrowRightLeft className="size-3.5" />
              Reasignar los {marcados.size} marcados a…
            </Button>
          )}
          {comercialFiltrado && cantidadFiltrados > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => abrir({ modo: "filtrados", cantidad: cantidadFiltrados })}
            >
              <ArrowRightLeft className="size-3.5" />
              {comercialFiltrado.total > tope
                ? `Reasignar los ${tope} más antiguos de ${comercialFiltrado.etiqueta} a…`
                : `Reasignar los ${comercialFiltrado.total} filtrados de ${comercialFiltrado.etiqueta} a…`}
            </Button>
          )}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <input
                type="checkbox"
                aria-label="Marcar todos los de esta página"
                checked={todosMarcados}
                onChange={alternarTodos}
                className="size-4 cursor-pointer accent-primary"
              />
            </TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Cartera de</TableHead>
            <TableHead>Última venta</TableHead>
            <TableHead>Sin venta hace</TableHead>
            <TableHead className="text-right">Acción</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.id} data-state={marcados.has(f.id) ? "selected" : undefined}>
              <TableCell>
                <input
                  type="checkbox"
                  aria-label={`Marcar ${f.razonSocial}`}
                  checked={marcados.has(f.id)}
                  onChange={() => alternar(f.id)}
                  className="size-4 cursor-pointer accent-primary"
                />
              </TableCell>
              <TableCell>
                <Link href={`/gerencia/clientes/${f.id}`} className="font-medium text-foreground hover:underline">
                  {f.razonSocial}
                </Link>
                {f.numDoc && <span className="block text-xs text-muted-foreground tabular-nums">{f.numDoc}</span>}
              </TableCell>
              <TableCell className="text-sm">
                {f.comercial ? (
                  <>
                    {f.comercial.codigo && <b className="mr-1 text-foreground">{f.comercial.codigo}</b>}
                    <span className="text-muted-foreground">{f.comercial.nombre}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {f.ultimaVentaAt ? fechaLima(f.ultimaVentaAt) : "Nunca compró"}
              </TableCell>
              <TableCell className="tabular-nums font-medium text-foreground">
                {tiempoSinVenta(f.sinVentaDesde, ahora)}
              </TableCell>
              <TableCell className="text-right">
                <ReasignarCarteraBoton
                  cuentaId={f.id}
                  razonSocial={f.razonSocial}
                  comercialActual={f.comercialId}
                  comerciales={destinos}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={bloque !== null} onOpenChange={(v) => !enviando && !v && setBloque(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Reasignar {bloque?.cantidad} {bloque?.cantidad === 1 ? "cliente" : "clientes"}
            </DialogTitle>
            <DialogDescription>
              {bloque?.modo === "filtrados" ? (
                <>
                  Pasan <b>{bloque.cantidad}</b> clientes de <b>{deQuien}</b>
                  {comercialFiltrado && comercialFiltrado.total > tope
                    ? ` (los que más tiempo llevan sin venta; quedan ${comercialFiltrado.total - tope} para otra tanda)`
                    : ""}
                  {filtro.q ? `, solo los que coinciden con «${filtro.q}»` : ""}
                  {filtro.soloConVenta ? ", solo los que alguna vez compraron" : ""}.
                </>
              ) : (
                <>
                  Pasan los <b>{bloque?.cantidad}</b> clientes marcados, hoy de: {deQuien}.
                </>
              )}{" "}
              Se llevan sus oportunidades abiertas; las ventas y gestiones cerradas quedan con quien las trabajó. Cada
              comercial recibe <b>un solo aviso</b> con el conteo. Para deshacerlo habría que reasignarlos de vuelta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="destino-bloque">Pasan a</Label>
            <select
              id="destino-bloque"
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Elegir comercial…</option>
              {opciones.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo_comercial ? `${c.codigo_comercial} · ` : ""}
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={enviando} onClick={() => setBloque(null)}>
              Cancelar
            </Button>
            <Button disabled={enviando || !destino} onClick={confirmar} className="gap-1.5">
              {enviando && <Loader2 className="size-3.5 animate-spin" />}
              {elegido
                ? `Sí, pasar ${bloque?.cantidad} a ${elegido.codigo_comercial ?? elegido.nombre}`
                : "Elija a quién"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
