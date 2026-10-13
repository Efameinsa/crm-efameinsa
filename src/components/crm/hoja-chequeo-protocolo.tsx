"use client";

// LA HOJA DE CHEQUEO DEL PROTOCOLO, IDÉNTICA AL PAPEL (0452; Ariana, 13-10:
// «tiene que estar tal cual está aquí, solamente que se habiliten unas
// casillas para que le des check… vamos a tener una tablet»). Misma grilla
// que el papel —cabecera de 6 columnas, estructura y componentes con su
// observación, funcionamiento y programación en dos mitades, observaciones y
// firmas—, en una sola A4 al imprimir. Cliente, modelo, serie, fecha y N° de
// protocolo salen del informe; marca, voltaje y capacidad se proponen desde
// el pedido. En pantalla se marca con el dedo.

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { chequeoDelProtocolo } from "@/lib/acciones/almacen";
import { claveRenglon, renglonesConMarca, type Chequeo, type Plantilla, type Resultado } from "@/lib/protocolo-checklist";
import type { Maquina } from "@/lib/protocolo-hoja";

// Las columnas del papel, medidas sobre la foto (% del ancho de la hoja).
const COLS_CABECERA = [23, 16, 23.5, 11, 15, 11.5];
const COLS_OBSERVACION = [39, 50.5, 5.5, 5];
const COLS_MITADES = [40, 5.8, 6.5, 38.3, 4.5, 4.9];

const td = "cc border border-black px-1 align-middle";
const gris = "bg-neutral-200";

const Columnas = ({ anchos }: { anchos: number[] }) => (
  <colgroup>
    {anchos.map((a, i) => (
      <col key={i} style={{ width: `${a}%` }} />
    ))}
  </colgroup>
);

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
  fijos: { cliente: string; modelo?: string; serie?: string; fecha?: string | null; protocolo?: string | null };
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

  const cap = (fijos.fecha ?? "").slice(0, 10);
  const fijo: Record<string, string> = {
    "#cliente": fijos.cliente,
    "#modelo": fijos.modelo ?? "",
    "#serie": fijos.serie ?? "",
    "#fecha": cap ? `${cap.slice(8, 10)}-${cap.slice(5, 7)}-${cap.slice(0, 4)}` : "",
    "#protocolo": fijos.protocolo ?? "",
  };

  /** Un dato escrito: input en pantalla si se puede editar, texto si no. */
  const escrito = (
    valor: string | undefined,
    poner: (v: string) => void,
    { ayuda, max = 200, centro = false }: { ayuda?: string; max?: number; centro?: boolean } = {},
  ) =>
    editable ? (
      <input
        value={valor ?? ""}
        placeholder={ayuda}
        onChange={(e) => poner(e.target.value.slice(0, max))}
        className={`entrada h-9 w-full min-w-0 bg-amber-50/60 px-1 text-[13px] outline-none focus:bg-amber-100 ${centro ? "text-center" : ""}`}
      />
    ) : (
      <span className={`block ${centro ? "text-center" : ""}`}>{valor ?? ""}</span>
    );
  const dato = (k: string, ayuda?: string) =>
    escrito(ch.datos[k], (v) => cambiar((c) => ({ ...c, datos: { ...c.datos, [k]: v } })), { ayuda });

  const valorCabecera = (clave: string, ayuda?: string) => {
    if (clave.startsWith("#")) return <span className="block">{fijo[clave]}</span>;
    if (clave === "voltaje+fases")
      return (
        <div className="flex items-center gap-1">
          <div className="w-1/2">{dato("voltaje", ayuda)}</div>
          <div className="w-1/2">{dato("fases", "Monof./Trif.")}</div>
        </div>
      );
    return dato(clave, ayuda);
  };

  const casillas = (k: string) =>
    (["ok", "falla"] as const).map((r) => (
      <td key={r} className={`${td} p-0 text-center`}>
        <button
          type="button"
          disabled={!editable}
          aria-label={r === "ok" ? "Conforme" : "Con falla"}
          onClick={() => marcar(k, r)}
          className={`marca flex h-9 w-full items-center justify-center text-[16px] font-bold ${
            ch.marcas[k] === r ? (r === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700") : ""
          } ${editable ? "cursor-pointer hover:bg-neutral-100" : ""}`}
        >
          {ch.marcas[k] === r ? (r === "ok" ? "✓" : "✗") : ""}
        </button>
      </td>
    ));

  const botonTodo = (claves: string[]) =>
    editable && claves.some((k) => !ch.marcas[k]) ? (
      <button type="button" onClick={() => todoBien(claves)} className="no-imprimir ml-2 rounded bg-emerald-700 px-2 py-0.5 text-[11px] font-semibold normal-case text-white">
        Todo ✓
      </button>
    ) : null;

  const prog = (k: string) => escrito(ch.prog[k], (v) => cambiar((c) => ({ ...c, prog: { ...c.prog, [k]: v } })), { max: 10, centro: true });

  // La programación: de fábrica y de prueba, cada una con sus fases y el tiempo total (cantidad en gris, como el papel).
  const filasProgramacion = (["fabrica", "prueba"] as const).flatMap((tipo) => [
    { titulo: `PROGRAMACIÓN DE ${tipo === "fabrica" ? "FABRICA" : "PRUEBA"}`, k: null as string | null, total: false },
    ...[...plantilla.programacion.fases, "Tiempo total del ciclo"].map((f, i, todasF) => ({
      titulo: f,
      k: claveRenglon(`TIPO.${tipo}`, f),
      total: i === todasF.length - 1,
    })),
  ]);

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

  const tabla = "w-full table-fixed border-collapse";

  return (
    <section className="hoja-chequeo mt-10 break-before-page border-t-2 border-dashed border-neutral-300 pt-8 font-[Arial,Helvetica,sans-serif] text-[12px] text-black print:mt-0 print:border-0 print:pt-0">
      {/* CABECERA */}
      <table className={tabla}>
        <Columnas anchos={COLS_CABECERA} />
        <tbody>
          <tr>
            <td className={`${td} border-b-0`} />
            <td className={`${td} text-center text-[13px] font-bold`} colSpan={5}>
              {plantilla.titulo}
            </td>
          </tr>
          {plantilla.cabecera.map((fila, n) => (
            <tr key={n}>
              {fila.map((c, i) =>
                "vacio" in c ? (
                  <td key={i} className={`${td} ${c.texto ? "text-right align-bottom font-bold" : ""}`} colSpan={c.vacio}>
                    {c.texto ?? ""}
                  </td>
                ) : (
                  <Fragment key={i}>
                    <td className={`${td} ${c.etiqueta === c.etiqueta.toUpperCase() ? "font-bold" : ""}`}>{c.etiqueta}</td>
                    <td className={`${td} ${gris} p-0 px-1`} colSpan={c.span}>
                      {valorCabecera(c.clave, c.ayuda)}
                    </td>
                  </Fragment>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* ESTRUCTURA Y COMPONENTES */}
      <table className={`${tabla} -mt-px`}>
        <Columnas anchos={COLS_OBSERVACION} />
        <tbody>
          {plantilla.conObservacion.map((b, nb) => {
            const claves = b.renglones.map((r) => claveRenglon(b.clave, r));
            return (
              <Fragment key={b.clave}>
                <tr>
                  <td className={`${td} font-bold`}>
                    {b.titulo}
                    {botonTodo(claves)}
                  </td>
                  <td className={`${td} font-bold`}>OBSERVACIONES</td>
                  <td className={`${td} text-center font-bold`}>{nb === 0 ? "✓" : ""}</td>
                  <td className={`${td} text-center font-bold`}>{nb === 0 ? "✗" : ""}</td>
                </tr>
                {b.renglones.map((r, i) => {
                  const k = claves[i];
                  return (
                    <tr key={k}>
                      <td className={`${td} uppercase`}>{r}</td>
                      <td className={`${td} p-0 px-1`}>{escrito(ch.obs[k], (v) => cambiar((c) => ({ ...c, obs: { ...c.obs, [k]: v } })))}</td>
                      {casillas(k)}
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* FUNCIONAMIENTO: EN VACÍO A LA IZQUIERDA, CON CARGA A LA DERECHA */}
      <table className={`${tabla} -mt-px`}>
        <Columnas anchos={COLS_MITADES} />
        <tbody>
          <tr>
            {(["vacio", "carga"] as const).map((modo) => (
              <Fragment key={modo}>
                <td className={`${td} font-bold`}>
                  {modo === "vacio" ? "FUNCIONAMIENTO EN VACIO (CARGA 0)" : "FUNCIONAMIENTO CON CARGA"}
                  {botonTodo(plantilla.funcionamiento.map((r) => claveRenglon(modo, r)))}
                </td>
                <td className={`${td} text-center font-bold`}>✓</td>
                <td className={`${td} text-center font-bold`}>✗</td>
              </Fragment>
            ))}
          </tr>
          {plantilla.funcionamiento.map((r) => (
            <tr key={r}>
              {(["vacio", "carga"] as const).map((modo) => (
                <Fragment key={modo}>
                  <td className={`${td} uppercase`}>{r}</td>
                  {casillas(claveRenglon(modo, r))}
                </Fragment>
              ))}
            </tr>
          ))}

          {/* PROGRAMACIÓN */}
          <tr>
            {(["vacio", "carga"] as const).map((modo) => (
              <Fragment key={modo}>
                <td className={`${td} titulo-prog py-2 font-bold`}>{modo === "vacio" ? "PROGRAMACIÓN EN VACIO (CARGA 0)" : "PROGRAMACIÓN CON CARGA"}</td>
                <td className={`${td} text-center font-bold`}>CANT.</td>
                <td className={`${td} text-center font-bold`}>MIN.</td>
              </Fragment>
            ))}
          </tr>
          {filasProgramacion.map((f, n) => (
            <tr key={n}>
              {(["vacio", "carga"] as const).map((modo) => {
                const k = f.k?.replace("TIPO", modo);
                return (
                  <Fragment key={modo}>
                    <td className={`${td} uppercase ${f.k ? "" : "underline"}`}>{f.titulo}</td>
                    <td className={`${td} p-0 ${f.total ? gris : ""}`}>{k && !f.total ? prog(`${k}.cant`) : null}</td>
                    <td className={`${td} p-0`}>{k ? prog(`${k}.min`) : null}</td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* OBSERVACIONES */}
      <div className="observaciones -mt-px flex min-h-36 items-start gap-2 border border-black px-1 py-2">
        <span className="mt-10 shrink-0 font-bold">OBSERVACIONES:</span>
        {editable ? (
          <textarea
            rows={5}
            value={ch.datos.observaciones ?? ""}
            onChange={(e) => cambiar((c) => ({ ...c, datos: { ...c.datos, observaciones: e.target.value.slice(0, 1000) } }))}
            className="entrada block w-full resize-y bg-amber-50/60 px-1 py-1 text-[13px] outline-none focus:bg-amber-100"
          />
        ) : (
          <p className="mt-10 whitespace-pre-wrap">{ch.datos.observaciones ?? ""}</p>
        )}
      </div>

      {/* FIRMAS */}
      <div className="-mt-px border border-black px-1 py-1">
        {plantilla.pie.map((c) => (
          <div key={c.clave} className="flex items-center gap-2">
            <span className="w-48 shrink-0 font-bold uppercase print:w-36">{c.etiqueta}:</span>
            <div className="flex-1">{dato(c.clave)}</div>
          </div>
        ))}
      </div>

      {editable && (
        <div className="no-imprimir sticky bottom-0 z-10 mt-3 flex flex-wrap items-center gap-3 border-t border-neutral-300 bg-white/95 py-2 font-sans backdrop-blur">
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

      {/* Al imprimir, una sola A4 como el papel. */}
      <style>{`
        @media print {
          .hoja-chequeo { break-inside: avoid; font-size: 8.5px; line-height: 1.15; }
          .hoja-chequeo .cc { height: 4.1mm; padding-top: 0; padding-bottom: 0; }
          .hoja-chequeo .titulo-prog { height: 7mm; }
          .hoja-chequeo .entrada, .hoja-chequeo .marca { height: auto; min-height: 0; background: transparent !important; font-size: 8.5px; padding: 0; color: #000; }
          .hoja-chequeo .marca { font-size: 10px; }
          .hoja-chequeo .entrada::placeholder { color: transparent; }
          .hoja-chequeo .bg-neutral-200 { background: #d9d9d9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .hoja-chequeo .observaciones { min-height: 32mm; }
          .hoja-chequeo textarea { resize: none; border: 0; }
        }
      `}</style>
    </section>
  );
}
