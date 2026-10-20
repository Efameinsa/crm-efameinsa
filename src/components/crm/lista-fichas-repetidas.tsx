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

export interface FichaRepetida {
  id: string;
  razon_social: string;
  documento: string | null;
  comercial: string | null;
  expedientes: number;
  pedidos: number;
  casos: number;
  cierres: number;
}

/**
 * LOS GRUPOS DE FICHAS QUE PARECEN EL MISMO CLIENTE (0556, gerencia 20-10,
 * Family Farm). Cada grupo: sus fichas, con qué tiene cada una, «Unir» (la
 * primera, la que tiene RUC o más movimiento, es la que se queda) y «No son el
 * mismo» para que el grupo no vuelva a salir.
 */
export function ListaFichasRepetidas({
  grupos,
  supervisores,
}: {
  grupos: { clave: string; cuentas: FichaRepetida[] }[];
  supervisores: { id: string; nombre: string; rol?: string }[];
}) {
  const [filtro, setFiltro] = useState("");
  const [union, setUnion] = useState<{ origen: FichaEnUnion; destino: FichaEnUnion } | null>(null);
  const visibles = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return f ? grupos.filter((g) => g.cuentas.some((c) => c.razon_social.toLowerCase().includes(f))) : grupos;
  }, [grupos, filtro]);
  const comoFicha = (c: FichaRepetida): FichaEnUnion => ({ id: c.id, razonSocial: c.razon_social, documento: c.documento, comercial: c.comercial });

  return (
    <div className="space-y-3">
      <Input placeholder="Buscar por nombre" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="max-w-sm" />
      <p className="text-xs text-muted-foreground">
        {visibles.length} grupo{visibles.length === 1 ? "" : "s"}
        {filtro ? ` de ${grupos.length}` : ""}. La primera ficha de cada grupo es la que se queda (la que tiene RUC o más movimiento).
      </p>
      <ul className="space-y-2">
        {visibles.slice(0, 150).map((g) => {
          const destino = g.cuentas[0];
          return (
            <li key={g.clave} className="rounded-xl border border-border bg-card p-3 shadow-sm">
              <ul className="space-y-1.5">
                {g.cuentas.map((c, i) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <Link href={`/nuevo/cliente/${c.id}`} className="font-medium text-foreground hover:underline">
                      {c.razon_social}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {c.documento ?? "sin RUC ni DNI"} · {c.comercial ?? "sin cartera"} · {c.expedientes} exp. · {c.pedidos} ped. · {c.casos} casos · {c.cierres} cierres
                    </span>
                    {i === 0 ? (
                      <span className="rounded-full bg-[#1E7F4F]/10 px-2 py-0.5 text-[10px] font-semibold text-[#1E7F4F]">se queda</span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setUnion({ origen: comoFicha(c), destino: comoFicha(destino) })}>
                        Unir a la primera
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-end">
                <NoSonElMismo clave={g.clave} />
              </div>
            </li>
          );
        })}
      </ul>
      {visibles.length > 150 && <p className="text-xs text-muted-foreground">Se muestran 150; busque por nombre para ver el resto.</p>}
      {union && (
        <DialogoUnirFichas
          abierto
          onOpenChange={(v) => !v && setUnion(null)}
          origen={union.origen}
          destino={union.destino}
          supervisores={supervisores}
          motivoInicial="Mismo cliente: una ficha con RUC y otra con el nombre escrito a mano (lista de fichas repetidas)."
          alUnir={() => setUnion(null)}
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
          toast.success("Listo: este grupo ya no vuelve a salir.");
          router.refresh();
        })
      }
    >
      {pendiente && <Loader2 className="size-3.5 animate-spin" />}
      No son el mismo cliente
    </Button>
  );
}
