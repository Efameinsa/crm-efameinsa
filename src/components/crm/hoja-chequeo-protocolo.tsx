"use client";

// LA HOJA DE CHEQUEO DEL PROTOCOLO, COMO EL PAPEL (0452; Ariana, 13-10:
// «tiene que estar tal cual está aquí, solamente que se habiliten unas
// casillas para que le des check… vamos a tener una tablet»). Cliente,
// modelo, serie y fecha salen del informe; marca, voltaje y capacidad se
// proponen desde el pedido. En pantalla se marca con el dedo; al imprimir
// sale la tabla con sus ✓ y ✗.

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { chequeoDelProtocolo } from "@/lib/acciones/almacen";
import { claveRenglon, renglonesConMarca, type Chequeo, type Plantilla, type Resultado } from "@/lib/protocolo-checklist";
import type { Maquina } from "@/lib/protocolo-hoja";

const celda = "border border-black px-1.5 py-0.5 align-middle";

export function HojaChequeoProtocolo({
  itemId,
  servicioId,
  maquina,
  plantilla,
  fijos,
  inicial,
  editable,
  guardadoAt,
}: {
  itemId: string;
  servicioId: string;
  maquina: Maquina;
  plantilla: Plantilla;
  /** Lo que ya dice el informe: no se escribe dos veces. */
  fijos: { cliente: string; modelo?: string; serie?: string; fecha?: string | null };
  inicial: Chequeo;
  editable: boolean;
  guardadoAt: string | null;
}) {
  const router = useRouter();
  const [ch, setCh] = useState<Chequeo>(inicial);
  const [cambiado, setCambiado] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const todas = useMemo(() => renglonesConMarca(plantilla), [plantilla]);
  const faltan = todas.filter((k) => !ch.marcas[k]).length;
  const fallas = todas.filter((k) => ch.marcas[k] === "falla").length;

  const cambiar = (f: (c: Chequeo) => Chequeo) => {
    if (!editable) return;
    setCh(f);
    setCambiado(true);
  };
  const marcar = (k: string, r: Resultado) =>
    cambiar((c) => {
      const marcas = { ...c.marcas };
      if (marcas[k] === r) delete marcas[k];
      else marcas[k] = r;
      return { ...c, marcas };
    });
  const todoBien = (claves: string[]) =>
    cambiar((c) => ({ ...c, marcas: { ...c.marcas, ...Object.fromEntries(claves.filter((k) => !c.marcas[k]).map((k) => [k, "ok" as const])) } }));
  const dato = (k: string, v: string) => cambiar((c) => ({ ...c, datos: { ...c.datos, [k]: v } }));

  const casillas = (k: string) => (
    <>
      {(["ok", "falla"] as const).map((r) => (
        <td key={r} className={`${celda} w-10 p-0 text-center`}>
          <button
            type="button"
            disabled={!editable}
            aria-label={`${r === "ok" ? "Conforme" : "Con falla"}`}
            onClick={() => marcar(k, r)}
            className={`flex h-9 w-full items-center justify-center text-[16px] font-bold print:h-auto print:text-[11px] ${
              ch.marcas[k] === r ? (r === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700") : "text-transparent"
            } ${editable ? "cursor-pointer hover:bg-neutral-100" : ""} print:bg-transparent print:text-black`}
          >
            {ch.marcas[k] === r ? (r === "ok" ? "✓" : "✗") : "·"}
          </button>
        </td>
      ))}
    </>
  );

  const campo = (k: string, etiqueta: string, ayuda?: string, tipo?: "time") => (
    <tr key={k}>
      <td className={`${celda} w-1/3 font-semibold`}>{etiqueta}:</td>
      <td className={`${celda} p-0`}>
        {editable ? (
          <input
            type={tipo ?? "text"}
            value={ch.datos[k] ?? ""}
            placeholder={ayuda}
            onChange={(e) => dato(k, e.target.value)}
            className="h-9 w-full bg-amber-50/40 px-1.5 text-[13px] outline-none focus:bg-amber-50 print:h-auto print:bg-transparent print:text-[11px]"
          />
        ) : (
          <span className="block px-1.5">{ch.datos[k] ?? ""}</span>
        )}
      </td>
    </tr>
  );

  const cabeza = (titulo: string, claves: string[], obs = false) => (
    <tr className="bg-neutral-200 print:bg-neutral-200">
      <th className={`${celda} text-left`}>
        {titulo}
        {editable && claves.some((k) => !ch.marcas[k]) && (
          <button type="button" onClick={() => todoBien(claves)} className="no-imprimir ml-2 rounded bg-emerald-700 px-2 py-0.5 text-[11px] font-semibold text-white">
            Todo ✓
          </button>
        )}
      </th>
      {obs && <th className={`${celda} text-left`}>OBSERVACIONES</th>}
      <th className={`${celda} text-center`}>✓</th>
      <th className={`${celda} text-center`}>✗</th>
    </tr>
  );

  const prog = (k: string) =>
    editable ? (
      <input
        inputMode="numeric"
        value={ch.prog[k] ?? ""}
        onChange={(e) => cambiar((c) => ({ ...c, prog: { ...c.prog, [k]: e.target.value.slice(0, 10) } }))}
        className="h-8 w-full bg-amber-50/40 text-center text-[13px] outline-none focus:bg-amber-50 print:h-auto print:bg-transparent print:text-[11px]"
      />
    ) : (
      <span>{ch.prog[k] ?? ""}</span>
    );

  const programacion = (modo: "vacio" | "carga", titulo: string) => (
    <table key={`prog-${modo}`} className="w-full border-collapse">
      <thead>
        <tr className="bg-neutral-200">
          <th className={`${celda} text-left`}>{titulo}</th>
          <th className={`${celda} w-14 text-center`}>CANT.</th>
          <th className={`${celda} w-14 text-center`}>MIN.</th>
        </tr>
      </thead>
      <tbody>
        {(["fabrica", "prueba"] as const).map((tipo) => progBloque(modo, tipo))}
      </tbody>
    </table>
  );
  const progBloque = (modo: string, tipo: "fabrica" | "prueba") => (
    <Fragment key={tipo}>
      <tr>
        <td className={`${celda} font-semibold underline`} colSpan={3}>
          PROGRAMACIÓN DE {tipo === "fabrica" ? "FÁBRICA" : "PRUEBA"}
        </td>
      </tr>
      {[...plantilla.programacion.fases, "Tiempo total del ciclo"].map((f) => {
        const k = claveRenglon(`${modo}.${tipo}`, f);
        return (
          <tr key={k}>
            <td className={celda}>{f}</td>
            <td className={`${celda} p-0 text-center`}>{prog(`${k}.cant`)}</td>
            <td className={`${celda} p-0 text-center`}>{prog(`${k}.min`)}</td>
          </tr>
        );
      })}
    </Fragment>
  );

  const guardar = () =>
    startTransition(async () => {
      const r = await chequeoDelProtocolo(itemId, servicioId, maquina, ch);
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success(faltan ? `Protocolo guardado · faltan ${faltan} casillas` : "Protocolo guardado completo");
      setCambiado(false);
      router.refresh();
    });

  const cap = (fijos.fecha ?? "").slice(0, 10);
  const fecha = cap ? `${cap.slice(8, 10)}-${cap.slice(5, 7)}-${cap.slice(0, 4)}` : "";

  return (
    <section className="hoja-chequeo mt-10 break-before-page border-t-2 border-dashed border-neutral-300 pt-8 text-[12px] print:mt-0 print:border-0 print:pt-0 print:text-[10px]">
      <h2 className="mb-2 text-center text-[14px] font-bold">{plantilla.titulo}</h2>

      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <td className={`${celda} w-1/3 font-semibold`}>Cliente:</td>
            <td className={celda}>{fijos.cliente}</td>
          </tr>
          <tr>
            <td className={`${celda} font-semibold`}>Modelo:</td>
            <td className={celda}>{fijos.modelo ?? ""}</td>
          </tr>
          <tr>
            <td className={`${celda} font-semibold`}>N.º de serie:</td>
            <td className={celda}>{fijos.serie ?? ""}</td>
          </tr>
          <tr>
            <td className={`${celda} font-semibold`}>Fecha:</td>
            <td className={celda}>{fecha}</td>
          </tr>
          {plantilla.cabecera.map((c) => (
            campo(c.clave, c.etiqueta, c.ayuda, c.tipo)
          ))}
        </tbody>
      </table>

      {plantilla.conObservacion.map((b) => {
        const claves = b.renglones.map((r) => claveRenglon(b.clave, r));
        return (
          <table key={b.clave} className="mt-3 w-full border-collapse">
            <thead>
              {cabeza(b.titulo, claves, true)}
            </thead>
            <tbody>
              {b.renglones.map((r, i) => {
                const k = claves[i];
                return (
                  <tr key={k}>
                    <td className={`${celda} w-1/3`}>{r}</td>
                    <td className={`${celda} p-0`}>
                      {editable ? (
                        <input
                          value={ch.obs[k] ?? ""}
                          onChange={(e) => cambiar((c) => ({ ...c, obs: { ...c.obs, [k]: e.target.value.slice(0, 200) } }))}
                          className="h-9 w-full bg-transparent px-1.5 text-[12px] outline-none focus:bg-amber-50 print:h-auto print:text-[10px]"
                        />
                      ) : (
                        <span className="block px-1.5">{ch.obs[k] ?? ""}</span>
                      )}
                    </td>
                    {casillas(k)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
        {(["vacio", "carga"] as const).map((modo) => {
          const claves = plantilla.funcionamiento.map((r) => claveRenglon(modo, r));
          return (
            <table key={modo} className="w-full border-collapse">
              <thead>
                {cabeza(modo === "vacio" ? "FUNCIONAMIENTO EN VACÍO (CARGA 0)" : "FUNCIONAMIENTO CON CARGA", claves)}
              </thead>
              <tbody>
                {plantilla.funcionamiento.map((r, i) => (
                  <tr key={claves[i]}>
                    <td className={celda}>{r}</td>
                    {casillas(claves[i])}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })}
        {programacion("vacio", "PROGRAMACIÓN EN VACÍO (CARGA 0)")}
        {programacion("carga", "PROGRAMACIÓN CON CARGA")}
      </div>

      <table className="mt-3 w-full border-collapse">
        <tbody>
          <tr>
            <td className={`${celda} w-1/3 font-semibold`}>Observaciones:</td>
            <td className={`${celda} p-0`}>
              {editable ? (
                <textarea
                  rows={3}
                  value={ch.datos.observaciones ?? ""}
                  onChange={(e) => dato("observaciones", e.target.value.slice(0, 1000))}
                  className="block w-full resize-y bg-amber-50/40 px-1.5 py-1 text-[13px] outline-none focus:bg-amber-50 print:bg-transparent print:text-[11px]"
                />
              ) : (
                <p className="min-h-12 whitespace-pre-wrap px-1.5">{ch.datos.observaciones ?? ""}</p>
              )}
            </td>
          </tr>
          {plantilla.pie.map((c) => (
            campo(c.clave, c.etiqueta)
          ))}
        </tbody>
      </table>

      {editable && (
        <div className="no-imprimir sticky bottom-0 z-10 mt-3 flex flex-wrap items-center gap-3 border-t border-neutral-300 bg-white/95 py-2 backdrop-blur">
          <button
            type="button"
            disabled={pendiente || !cambiado}
            onClick={guardar}
            className="h-10 rounded bg-[#8B1510] px-5 text-[14px] font-semibold text-white disabled:opacity-40"
          >
            {pendiente ? <Loader2 className="inline size-4 animate-spin" /> : "Guardar protocolo"}
          </button>
          <span className="text-[12px] text-neutral-700">
            {faltan === 0 ? "Todas las casillas marcadas" : `Faltan ${faltan} de ${todas.length} casillas`}
            {fallas > 0 && <b className="ml-2 text-red-700">· {fallas} con falla ✗</b>}
          </span>
          {cambiado ? (
            <span className="text-[12px] text-amber-700">Hay cambios sin guardar</span>
          ) : guardadoAt ? (
            <span className="text-[12px] text-neutral-500">
              Guardado {new Date(guardadoAt).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}
            </span>
          ) : null}
        </div>
      )}
    </section>
  );
}
