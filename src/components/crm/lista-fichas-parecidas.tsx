"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import Link from "@/components/enlace";
import { DialogoUnirFichas, type FichaEnUnion } from "@/components/crm/dialogo-unir-fichas";
import { noSonElMismo } from "@/lib/acciones/fichas-repetidas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface LadoFicha {
  id: string;
  razon_social: string;
  documento: string | null;
  comercial: string | null;
  direccion: string | null;
  creada: string;
  contactos: { nombre: string | null; telefono: string | null; email: string | null }[];
  expedientes: number;
  pedidos: number;
  casos: number;
  cierres: number;
  ultima_gestion: string | null;
}
export interface ParParecido {
  cuenta_a: string;
  cuenta_b: string;
  porcentaje: number;
  motivos: string[];
  a: LadoFicha;
  b: LadoFicha;
}

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima" }) : "—");
const movimiento = (f: LadoFicha) => f.expedientes + f.pedidos + f.casos + f.cierres;

/**
 * EL MISMO CLIENTE REGISTRADO DISTINTO, PARA REVISARLO A MANO (Santos 21-10;
 * reunión de gerencia 20-10). Cada pareja lado a lado —nombre, documento,
 * cartera, contactos, dirección y lo que tiene cada ficha— con el porcentaje y
 * el porqué. La persona decide: unir (y cuál se queda) o «No son el mismo».
 */
export function ListaFichasParecidas({
  pares,
  supervisores,
  min,
  calculadoAt,
}: {
  pares: ParParecido[];
  supervisores: { id: string; nombre: string; rol?: string }[];
  min: number;
  calculadoAt: string | null;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState("");
  const [union, setUnion] = useState<{ origen: FichaEnUnion; destino: FichaEnUnion } | null>(null);
  const visibles = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return f ? pares.filter((p) => p.a.razon_social.toLowerCase().includes(f) || p.b.razon_social.toLowerCase().includes(f)) : pares;
  }, [pares, filtro]);
  const comoFicha = (c: LadoFicha): FichaEnUnion => ({ id: c.id, razonSocial: c.razon_social, documento: c.documento, comercial: c.comercial });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar por nombre" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="max-w-xs" />
        <span className="text-xs text-muted-foreground">Coincidencia desde:</span>
        {[80, 60, 45].map((n) => (
          <Link
            key={n}
            href={`/fichas-repetidas?ver=parecidas&min=${n}`}
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-medium",
              min === n ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {n} %
          </Link>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {visibles.length} pareja{visibles.length === 1 ? "" : "s"} con {min} % o más{filtro ? ` (de ${pares.length})` : ""}. Compare las dos
        fichas: si son el mismo cliente, únalas y elija cuál se queda (normalmente la que tiene RUC o más movimiento); si no, márquelo
        y la pareja no vuelve a salir. La búsqueda se hace cada noche; lo que se une o se descarta sale de la lista al momento{calculadoAt ? ` · última búsqueda: ${fecha(calculadoAt)}` : ""}.
      </p>
      <ul className="space-y-3">
        {visibles.slice(0, 120).map((p) => {
          // Propuesta: se queda la que tiene documento y, si no, la de más movimiento.
          const aPrimero = (Boolean(p.a.documento) && !p.b.documento) || (Boolean(p.a.documento) === Boolean(p.b.documento) && movimiento(p.a) >= movimiento(p.b));
          const queda = aPrimero ? p.a : p.b;
          const va = aPrimero ? p.b : p.a;
          return (
            <li key={`${p.cuenta_a}-${p.cuenta_b}`} className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-bold",
                    p.porcentaje >= 80 ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : p.porcentaje >= 60 ? "bg-amber-500/10 text-amber-900 dark:text-amber-300" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {p.porcentaje} % de coincidencia
                </span>
                <span className="text-muted-foreground">{p.motivos.join(" · ")}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[p.a, p.b].map((f) => (
                  <div key={f.id} className={cn("rounded-lg border p-2.5 text-xs", f.id === queda.id ? "border-[#1E7F4F]/40" : "border-border")}>
                    <Link href={`/nuevo/cliente/${f.id}`} className="text-sm font-semibold text-foreground hover:underline">
                      {f.razon_social}
                    </Link>
                    <dl className="mt-1 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-0.5 text-muted-foreground">
                      <dt>Documento</dt>
                      <dd className={cn("text-foreground", !f.documento && "text-amber-800 dark:text-amber-300")}>{f.documento ?? "sin RUC ni DNI"}</dd>
                      <dt>Cartera</dt>
                      <dd className="text-foreground">{f.comercial ?? "sin cartera"}</dd>
                      <dt>Contactos</dt>
                      <dd className="text-foreground">
                        {f.contactos.length === 0
                          ? "—"
                          : f.contactos.map((k, i) => (
                              <span key={i} className="block">
                                {[k.nombre, k.telefono, k.email].filter(Boolean).join(" · ")}
                              </span>
                            ))}
                      </dd>
                      <dt>Dirección</dt>
                      <dd className="text-foreground">{f.direccion ?? "—"}</dd>
                      <dt>Tiene</dt>
                      <dd className="text-foreground">
                        {f.expedientes} exp. · {f.pedidos} ped. · {f.casos} casos · {f.cierres} cierres
                      </dd>
                      <dt>Última gestión</dt>
                      <dd className="text-foreground">{fecha(f.ultima_gestion)}</dd>
                      <dt>Creada</dt>
                      <dd className="text-foreground">{fecha(f.creada)}</dd>
                    </dl>
                    {f.id === queda.id && <p className="mt-1 text-[11px] font-semibold text-[#1E7F4F]">Se propone que se quede esta</p>}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <NoSonElMismo clave={`par:${p.cuenta_a}:${p.cuenta_b}`} />
                <Button size="sm" variant="outline" onClick={() => setUnion({ origen: comoFicha(queda), destino: comoFicha(va) })}>
                  Unir: se queda la otra
                </Button>
                <Button size="sm" onClick={() => setUnion({ origen: comoFicha(va), destino: comoFicha(queda) })}>
                  Unir: se queda la propuesta
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {visibles.length > 120 && <p className="text-xs text-muted-foreground">Se muestran 120; busque por nombre o suba el porcentaje.</p>}
      {union && (
        <DialogoUnirFichas
          abierto
          onOpenChange={(v) => !v && setUnion(null)}
          origen={union.origen}
          destino={union.destino}
          supervisores={supervisores}
          motivoInicial="Mismo cliente registrado de dos formas (revisado a mano en Fichas parecidas)."
          alUnir={() => {
            setUnion(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function NoSonElMismo({ clave }: { clave: string }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pendiente}
      onClick={() =>
        empezar(async () => {
          const r = await noSonElMismo(clave);
          if (r.error) return void toast.error(r.error, { duration: 8000 });
          toast.success("Listo: esta pareja ya no vuelve a salir.");
          router.refresh();
        })
      }
    >
      {pendiente && <Loader2 className="size-3.5 animate-spin" />}
      No son el mismo cliente
    </Button>
  );
}
