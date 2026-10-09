"use client";

import { useEffect, useState } from "react";
import { Building2, Search } from "lucide-react";
import {
  buscarCuentasParaUnir,
  historiaDeLaEmpresa,
  type CuentaParaUnir,
  type ResumenDeLaEmpresa,
} from "@/lib/acciones/leads";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HistoriaDelClienteDesplegable } from "@/components/crm/historia-del-cliente";
import { fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * VER LA HISTORIA DE LA EMPRESA QUE NOMBRA EL CONTACTO (Santos, 09-10).
 *
 * Entró «Leonardo · Centrum PUCP» con un Gmail: la persona no estaba en el
 * CRM, así que la bandeja no avisó nada. Pero la PUCP es cliente de C4, y eso
 * Central lo supo después de ir a buscarlo a mano. El aviso de la bandeja
 * cruza a la PERSONA (teléfono, documento, correo); esto deja buscar a la
 * INSTITUCIÓN que dice ser —por nombre, RUC, dominio o siglas— y leer de quién
 * es, qué se le cotizó y quién la gestionó, ANTES de derivar.
 *
 * Solo mira: no une ni deriva. Para unir está «Es un cliente que ya tenemos».
 */
export function HistoriaEmpresaBoton({
  razonSocial,
  dominio,
}: {
  razonSocial: string | null;
  dominio: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<CuentaParaUnir[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [elegida, setElegida] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenDeLaEmpresa | null>(null);
  const [cargando, setCargando] = useState(false);

  // Las pistas que trae el contacto, una por palabra: «Centrum PUCP» entero no
  // está en ninguna ficha, «PUCP» sí (por siglas).
  const pistas = [
    ...new Set(
      [razonSocial?.trim(), ...(razonSocial ?? "").split(/[\s,.;:()/-]+/).filter((p) => p.length >= 3), dominio]
        .filter((p): p is string => Boolean(p && p.length >= 3)),
    ),
  ].slice(0, 6);

  useEffect(() => {
    const texto = q.trim();
    if (!abierto || texto.length < 3) return;
    const t = setTimeout(() => {
      setBuscando(true);
      buscarCuentasParaUnir(texto)
        .then(setResultados)
        .finally(() => setBuscando(false));
    }, 350);
    return () => clearTimeout(t);
  }, [q, abierto]);
  // Con menos de 3 letras no se busca y lo anterior no se muestra.
  const visibles = q.trim().length >= 3 ? resultados : [];

  function ver(id: string) {
    setElegida(id);
    setResumen(null);
    setCargando(true);
    historiaDeLaEmpresa(id)
      .then(setResumen)
      .finally(() => setCargando(false));
  }

  function cerrar() {
    setAbierto(false);
    setQ("");
    setResultados([]);
    setElegida(null);
    setResumen(null);
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (!v) return cerrar();
        // Arranca buscando la primera pista que trae el contacto.
        if (!q && pistas[0]) setQ(pistas[0]);
        setAbierto(true);
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5">
            <Building2 className="size-4" />
            <span className="hidden sm:inline">Ver la historia de la empresa</span>
            <span className="sm:hidden">Empresa</span>
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>¿Qué historia tiene la empresa?</DialogTitle>
          <DialogDescription>
            Busque la institución que nombra el contacto y vea de quién es la cartera y quién la trabajó. Solo se
            mira: no une ni deriva nada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Nombre, RUC, dominio del correo o siglas (PUCP)"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setElegida(null);
                setResumen(null);
              }}
            />
          </div>
          {pistas.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              <span className="text-muted-foreground">Probar con:</span>
              {pistas.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setQ(p);
                    setElegida(null);
                    setResumen(null);
                  }}
                  className={cn(
                    "rounded-full border px-2 py-0.5 hover:bg-accent",
                    q === p ? "border-primary text-primary" : "border-border text-foreground",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="max-h-48 space-y-1.5 overflow-y-auto">
          {buscando && visibles.length === 0 && <p className="px-1 text-xs text-muted-foreground">Buscando…</p>}
          {!buscando && q.trim().length >= 3 && visibles.length === 0 && (
            <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
              Ninguna ficha dice «{q.trim()}». Pruebe con una sola palabra, las siglas o el RUC; si no aparece, la
              empresa no tiene historia en el CRM.
            </p>
          )}
          {visibles.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => ver(c.id)}
              className={cn(
                "flex w-full flex-col items-start gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                elegida === c.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent",
              )}
            >
              <span className="text-sm font-semibold leading-snug text-foreground">{c.razonSocial}</span>
              <span className="text-[11px] text-muted-foreground">
                {c.numDoc ? `${c.numDoc} · ` : ""}
                {c.codigoComercial || c.comercialNombre ? (
                  <>
                    cartera de{" "}
                    <b className="text-foreground">
                      {c.codigoComercial ? `${c.codigoComercial} · ` : ""}
                      {c.comercialNombre ?? "—"}
                    </b>
                  </>
                ) : (
                  "sin comercial asignado"
                )}
                {c.detalle ? ` · ${c.detalle}` : ""}
              </span>
            </button>
          ))}
        </div>

        {elegida && cargando && <p className="text-xs text-muted-foreground">Trayendo la historia…</p>}
        {resumen && (
          <div className="rounded-lg border border-border p-3 text-xs">
            <p className="text-sm font-semibold text-foreground">{resumen.razonSocial}</p>
            <p className="mt-0.5 text-muted-foreground">
              {resumen.numDoc ? `${resumen.numDoc} · ` : ""}
              {resumen.cartera ? (
                <>
                  cartera de <b className="text-foreground">{resumen.cartera}</b>
                  {resumen.carteraDesde && ` desde el ${fechaLima(resumen.carteraDesde)}`}
                </>
              ) : (
                "sin comercial asignado"
              )}
              {" · "}
              {resumen.ultimaVenta ? `última venta el ${fechaLima(resumen.ultimaVenta)}` : "sin ventas registradas"}
            </p>

            {resumen.cotizacionesArchivo.length > 0 && (
              <div className="mt-2">
                <p className="mb-0.5 font-semibold text-foreground">
                  Cotizaciones de antes del CRM · {resumen.totalCotizacionesArchivo}
                </p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {resumen.cotizacionesArchivo.map((a, i) => (
                    <li key={`${a.codigo}-${i}`}>
                      <span className="font-mono text-foreground">{a.codigo ?? "s/n"}</span>
                      {a.fecha && ` · ${fechaLima(a.fecha)}`}
                      {a.monto != null && ` · ${Number(a.monto).toLocaleString("es-PE")} sin IGV`}
                      {a.quien && ` · ${a.quien}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {resumen.historia ? (
              <HistoriaDelClienteDesplegable
                h={resumen.historia}
                razonSocial={resumen.razonSocial}
                cuentaId={resumen.id}
                abierta
              />
            ) : (
              <p className="mt-2 text-muted-foreground">
                La ficha existe pero no tiene expedientes en el CRM.{" "}
                <a
                  href={`/central/clientes/${resumen.id}`}
                  target="_blank"
                  rel="noopener"
                  className="font-semibold text-primary hover:underline"
                >
                  Abrir la ficha completa ↗
                </a>
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
