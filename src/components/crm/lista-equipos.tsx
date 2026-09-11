"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ShieldCheck, ShieldOff, Wrench } from "lucide-react";
import { fechaCalendario } from "@/lib/fechas";
import { estadoGarantia } from "@/lib/postventa";
import { cn } from "@/lib/utils";

/**
 * El parque instalado, con la búsqueda y los filtros EN EL NAVEGADOR.
 *
 * Misma razón que lista-parque.tsx (Santos, 11-09): cada filtro era una vuelta
 * al servidor por una lista que cabe entera en memoria (550 máquinas), sin
 * «cargando» porque era la misma pantalla. Las máquinas bajan una vez con
 * todo lo que hace falta para buscar —serie, modelo, cliente, RUC— y acá se
 * cortan al instante, de a tandas.
 */

export interface FilaEquipo {
  id: string;
  serie: string | null;
  cliente_texto: string | null;
  modelo_texto: string | null;
  ubicacion: string | null;
  fecha_despacho: string | null;
  garantia_hasta: string | null;
  ciclos_ultimo: number | null;
  ultimo_mantenimiento: string | null;
  proximo_mantenimiento: string | null;
  cuentas: { razon_social: string; num_doc: string | null; perfiles: { codigo_comercial: string | null; nombre: string } | null } | null;
}

type Ver = "" | "mantenimiento" | "garantia" | "vencida";
const FILTROS: { clave: Ver; etiqueta: string }[] = [
  { clave: "", etiqueta: "Todos" },
  { clave: "mantenimiento", etiqueta: "Mantenimiento vencido" },
  { clave: "garantia", etiqueta: "En garantía" },
  { clave: "vencida", etiqueta: "Fuera de garantía" },
];
const POR_TANDA = 40;

export function ListaEquipos({ equipos, hoy, inicial }: { equipos: FilaEquipo[]; hoy: string; inicial: { q: string; ver: Ver } }) {
  const [q, setQ] = useState(inicial.q);
  const [ver, setVer] = useState<Ver>(inicial.ver);
  const [visibles, setVisibles] = useState(POR_TANDA);

  function sincronizarUrl(nq: string, nver: Ver) {
    const p = new URLSearchParams();
    if (nver) p.set("ver", nver);
    if (nq.trim()) p.set("q", nq.trim());
    const s = p.toString();
    window.history.replaceState(null, "", `/postventa/equipos${s ? `?${s}` : ""}`);
    setVisibles(POR_TANDA);
  }

  const patron = q.trim().toLowerCase();
  const digitos = patron.replace(/\D/g, "");
  const lista = useMemo(
    () =>
      equipos.filter((e) => {
        if (ver === "garantia" && !(e.garantia_hasta && e.garantia_hasta >= hoy)) return false;
        if (ver === "vencida" && !(e.garantia_hasta && e.garantia_hasta < hoy)) return false;
        if (ver === "mantenimiento" && !(e.proximo_mantenimiento && e.proximo_mantenimiento <= hoy)) return false;
        if (!patron) return true;
        // Serie, modelo, cliente (la ficha o el texto suelto) y, si son
        // números, el RUC/DNI de la ficha — «20138427014» tiene que encontrar
        // a la Congregación Mercedaria (postventa, 01-09).
        return (
          (e.serie ?? "").toLowerCase().includes(patron) ||
          (e.modelo_texto ?? "").toLowerCase().includes(patron) ||
          (e.cliente_texto ?? "").toLowerCase().includes(patron) ||
          (e.cuentas?.razon_social ?? "").toLowerCase().includes(patron) ||
          (digitos.length >= 6 && (e.cuentas?.num_doc ?? "").startsWith(digitos))
        );
      }),
    [equipos, ver, patron, digitos, hoy],
  );
  const mostrados = lista.slice(0, visibles);
  const vencidos = equipos.filter((e) => e.proximo_mantenimiento != null && e.proximo_mantenimiento <= hoy).length;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {vencidos > 0 && ver !== "mantenimiento" && (
          <button
            type="button"
            onClick={() => { setVer("mantenimiento"); sincronizarUrl(q, "mantenimiento"); }}
            className="cursor-pointer rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-200"
          >
            {vencidos} con el mantenimiento vencido
          </button>
        )}
        <span className="text-xs text-muted-foreground">{equipos.length} máquinas</span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
          <Search className="size-3.5 flex-none text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); sincronizarUrl(e.target.value, ver); }}
            placeholder="Serie, cliente, RUC o modelo"
            className="w-full min-w-[160px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        {FILTROS.map((f) => (
          <button
            key={f.clave || "todos"}
            type="button"
            onClick={() => { setVer(f.clave); sincronizarUrl(q, f.clave); }}
            className={cn(
              "cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              ver === f.clave ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="max-w-prose space-y-2 text-sm text-muted-foreground">
          {patron || ver ? (
            <p>Nada que coincida con esa búsqueda.</p>
          ) : (
            <>
              <p>Todavía no hay equipos registrados en el parque instalado.</p>
              <p>
                Cada máquina entra acá con su serie cuando se cierra un pedido de despacho. Desde ese momento el sistema
                sabe hasta cuándo tiene garantía, cuántos ciclos lleva y cuándo le toca el próximo mantenimiento
                preventivo — que es lo que hoy solo pasa si el cliente llama.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {mostrados.map((e) => {
            const garantia = estadoGarantia(e.garantia_hasta);
            const mantenimientoVencido = e.proximo_mantenimiento != null && e.proximo_mantenimiento <= hoy;
            return (
              <Link
                key={e.id}
                href={`/postventa/equipos/${e.id}`}
                className="flex flex-wrap items-start gap-3 rounded-md border border-border p-2.5 transition-colors hover:bg-accent"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-8 flex-none items-center justify-center rounded-full",
                    garantia.vigente ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {garantia.vigente ? <ShieldCheck className="size-4" /> : <ShieldOff className="size-4" />}
                </span>
                <div className="min-w-[220px] flex-1">
                  <p className={cn("font-mono text-xs font-bold", e.serie ? "text-foreground" : "text-muted-foreground")}>
                    {e.serie ?? "Sin serie"}
                  </p>
                  <p className="line-clamp-1 text-sm text-foreground">{e.modelo_texto ?? "Equipo sin describir"}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.cuentas?.razon_social ?? e.cliente_texto ?? "—"}
                    {e.ubicacion && ` · ${e.ubicacion}`}
                    {/* De quién es el cliente, en la lista (gerencia, 10-09). */}
                    {e.cuentas?.perfiles?.codigo_comercial && (
                      <span
                        className="ml-1 rounded-full bg-secondary px-1.5 py-0.5 font-semibold"
                        title={`Cliente de la cartera de ${e.cuentas.perfiles.nombre}`}
                      >
                        cartera de {e.cuentas.perfiles.codigo_comercial}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right text-[11px]">
                  <span className={cn("font-semibold", garantia.vigente ? "text-[#1E7F4F]" : "text-muted-foreground")}>
                    {garantia.etiqueta}
                  </span>
                  <br />
                  <span className="text-muted-foreground">
                    {e.fecha_despacho
                      ? `despachado ${fechaCalendario(e.fecha_despacho)}`
                      : e.ultimo_mantenimiento
                        ? `último mantenimiento ${fechaCalendario(e.ultimo_mantenimiento)}`
                        : "sin historial de servicio"}
                    {e.ciclos_ultimo != null && ` · ${e.ciclos_ultimo.toLocaleString("es-PE")} ciclos`}
                  </span>
                  {mantenimientoVencido && (
                    <span className="mt-0.5 flex items-center justify-end gap-1 font-semibold text-amber-700">
                      <Wrench className="size-3" /> mantenimiento vencido
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
          {mostrados.length < lista.length && (
            <button
              type="button"
              onClick={() => setVisibles((v) => v + POR_TANDA)}
              className="block w-full cursor-pointer rounded-md border border-dashed border-border p-2.5 text-center text-xs font-medium text-primary hover:bg-accent"
            >
              Ver {Math.min(POR_TANDA, lista.length - mostrados.length)} más ({lista.length - mostrados.length} restantes)
            </button>
          )}
        </div>
      )}
    </>
  );
}
