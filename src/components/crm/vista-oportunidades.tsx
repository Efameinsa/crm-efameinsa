"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PuntoInteres } from "@/components/crm/punto-interes";
import { EtapaBadge } from "@/components/crm/etapa-badge";
import { PipelineKanban, type OportunidadKanban } from "@/components/crm/pipeline-kanban";
import { cn } from "@/lib/utils";
import type { EtapaOportunidad } from "@/types/database";

const CLAVE_PREFERENCIA = "efameinsa_vista_oportunidades";

const ETAPAS: EtapaOportunidad[] = [
  "asignada",
  "filtrada",
  "cotizada",
  "seguimiento",
  "potencial",
  "venta",
  "rechazada",
  "derivada",
];
const ORDEN_ETAPA: Record<string, number> = Object.fromEntries(ETAPAS.map((e, i) => [e, i]));
const ORDEN_INTERES: Record<string, number> = { alta: 3, media: 2, baja: 1, sin_definir: 0 };

type Columna = "cuenta" | "etapa" | "interes" | "monto";
type Direccion = "asc" | "desc";

interface Preferencia {
  vista: "kanban" | "tabla";
  etapaFiltro: string;
  interesFiltro: string;
  orden: Columna;
  direccion: Direccion;
}

const PREFERENCIA_DEFECTO: Preferencia = {
  vista: "kanban",
  etapaFiltro: "todas",
  interesFiltro: "todas",
  orden: "monto",
  direccion: "desc",
};

export function VistaOportunidades({
  oportunidades,
  motivos,
}: {
  oportunidades: OportunidadKanban[];
  motivos: { id: number; nombre: string }[];
}) {
  const [pref, setPref] = useState<Preferencia>(PREFERENCIA_DEFECTO);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    // localStorage no existe en el servidor: la preferencia real solo se
    // puede leer en el cliente, tras montar (coincide con el valor por
    // defecto que ya se usó en el render del servidor, no hay hidratación
    // desincronizada, solo una decisión que no puede tomarse antes).
    const guardado = localStorage.getItem(CLAVE_PREFERENCIA);
    if (guardado) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPref({ ...PREFERENCIA_DEFECTO, ...JSON.parse(guardado) });
      } catch {
        /* preferencia corrupta, se ignora */
      }
    }
  }, []);

  function actualizar(cambios: Partial<Preferencia>) {
    setPref((prev) => {
      const nueva = { ...prev, ...cambios };
      localStorage.setItem(CLAVE_PREFERENCIA, JSON.stringify(nueva));
      return nueva;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {(["kanban", "tabla"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => actualizar({ vista: v })}
              className={cn(
                "px-3.5 py-1.5 text-xs capitalize transition-colors",
                pref.vista === v ? "bg-foreground text-background font-semibold" : "bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {pref.vista === "kanban" ? (
        <PipelineKanban oportunidades={oportunidades} motivos={motivos} />
      ) : (
        <TablaOportunidades oportunidades={oportunidades} pref={pref} actualizar={actualizar} busqueda={busqueda} setBusqueda={setBusqueda} />
      )}
    </div>
  );
}

function TablaOportunidades({
  oportunidades,
  pref,
  actualizar,
  busqueda,
  setBusqueda,
}: {
  oportunidades: OportunidadKanban[];
  pref: Preferencia;
  actualizar: (c: Partial<Preferencia>) => void;
  busqueda: string;
  setBusqueda: (v: string) => void;
}) {
  const conteoEtapas = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of oportunidades) c[o.etapa] = (c[o.etapa] ?? 0) + 1;
    return c;
  }, [oportunidades]);

  const conteoInteres = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of oportunidades) c[o.intencion] = (c[o.intencion] ?? 0) + 1;
    return c;
  }, [oportunidades]);

  const filtradas = useMemo(() => {
    let lista = oportunidades;
    if (pref.etapaFiltro !== "todas") lista = lista.filter((o) => o.etapa === pref.etapaFiltro);
    if (pref.interesFiltro !== "todas") lista = lista.filter((o) => o.intencion === pref.interesFiltro);
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      lista = lista.filter((o) => o.razon_social.toLowerCase().includes(q));
    }
    const signo = pref.direccion === "asc" ? 1 : -1;
    return [...lista].sort((a, b) => {
      switch (pref.orden) {
        case "cuenta":
          return signo * a.razon_social.localeCompare(b.razon_social);
        case "etapa":
          return signo * ((ORDEN_ETAPA[a.etapa] ?? 0) - (ORDEN_ETAPA[b.etapa] ?? 0));
        case "interes":
          return signo * ((ORDEN_INTERES[a.intencion] ?? 0) - (ORDEN_INTERES[b.intencion] ?? 0));
        case "monto":
          return signo * ((a.monto_estimado ?? 0) - (b.monto_estimado ?? 0));
      }
    });
  }, [oportunidades, pref, busqueda]);

  function alternarOrden(col: Columna) {
    if (pref.orden === col) {
      actualizar({ direccion: pref.direccion === "asc" ? "desc" : "asc" });
    } else {
      actualizar({ orden: col, direccion: col === "cuenta" ? "asc" : "desc" });
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por cliente…"
          className="pl-8"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip activo={pref.etapaFiltro === "todas"} onClick={() => actualizar({ etapaFiltro: "todas" })}>
          Todas ({oportunidades.length})
        </Chip>
        {ETAPAS.filter((e) => conteoEtapas[e]).map((e) => (
          <Chip key={e} activo={pref.etapaFiltro === e} onClick={() => actualizar({ etapaFiltro: e })}>
            <EtapaBadge etapa={e} /> <span className="ml-1 tabular-nums">({conteoEtapas[e]})</span>
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip activo={pref.interesFiltro === "todas"} onClick={() => actualizar({ interesFiltro: "todas" })}>
          Cualquier interés
        </Chip>
        {(["alta", "media", "baja", "sin_definir"] as const)
          .filter((i) => conteoInteres[i])
          .map((i) => (
            <Chip key={i} activo={pref.interesFiltro === i} onClick={() => actualizar({ interesFiltro: i })}>
              <PuntoInteres intencion={i} /> <span className="ml-1 tabular-nums">({conteoInteres[i]})</span>
            </Chip>
          ))}
      </div>

      {filtradas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {oportunidades.length === 0 ? "Aún no tiene oportunidades asignadas." : "Nada coincide con el filtro."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button type="button" onClick={() => alternarOrden("cuenta")} className="inline-flex items-center gap-1 hover:text-foreground">
                  Cuenta <IconoOrden col="cuenta" orden={pref.orden} direccion={pref.direccion} />
                </button>
              </TableHead>
              <TableHead>
                <button type="button" onClick={() => alternarOrden("etapa")} className="inline-flex items-center gap-1 hover:text-foreground">
                  Etapa <IconoOrden col="etapa" orden={pref.orden} direccion={pref.direccion} />
                </button>
              </TableHead>
              <TableHead>
                <button type="button" onClick={() => alternarOrden("interes")} className="inline-flex items-center gap-1 hover:text-foreground">
                  Interés de compra <IconoOrden col="interes" orden={pref.orden} direccion={pref.direccion} />
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button type="button" onClick={() => alternarOrden("monto")} className="ml-auto inline-flex items-center gap-1 hover:text-foreground">
                  Monto estimado <IconoOrden col="monto" orden={pref.orden} direccion={pref.direccion} />
                </button>
              </TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.map((op) => (
              <TableRow key={op.id}>
                <TableCell>{op.razon_social}</TableCell>
                <TableCell>
                  <EtapaBadge etapa={op.etapa} />
                </TableCell>
                <TableCell>
                  <PuntoInteres intencion={op.intencion} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {op.monto_estimado ? `${op.moneda} ${op.monto_estimado.toLocaleString("es-PE")}` : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/comercial/oportunidades/${op.id}`} className="text-sm text-primary hover:underline">
                    Ver
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function IconoOrden({ col, orden, direccion }: { col: Columna; orden: Columna; direccion: Direccion }) {
  if (orden !== col) return <ArrowUpDown className="size-3.5 text-muted-foreground/50" />;
  return direccion === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs transition-colors",
        activo ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
