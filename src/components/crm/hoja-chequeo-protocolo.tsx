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
import { chequeoDelProtocolo, datosDelProtocolo } from "@/lib/acciones/almacen";
import { chequeoDelProtocoloDeStock, datosDelProtocoloDeStock } from "@/lib/acciones/protocolo-stock";
import { claveEnergia, claveRenglon, renglonesConMarca, type Chequeo, type Plantilla, type Resultado } from "@/lib/protocolo-checklist";
import type { DatosHoja, Maquina } from "@/lib/protocolo-hoja";

// Las columnas del papel, medidas sobre la foto (% del ancho de la hoja).
const COLS_CABECERA = [23, 16, 23.5, 11, 15, 11.5];
const COLS_OBSERVACION = [39, 50.5, 5.5, 5];
const COLS_MITADES = [40, 5.8, 6.5, 38.3, 4.5, 4.9];
// Prensa, rodillo y calderín: componente, ✓/✗ por GAS, ELÉCTRICO y VAPOR, observación.
const COLS_ENERGIA = [33, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 28];

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
  hoja,
  editable,
  guardadoAt,
  stockId,
}: {
  itemId: string;
  servicioId: string;
  maquina: Maquina;
  plantilla: Plantilla;
  /** Lo que ya dice el informe: no se escribe dos veces. */
  fijos: { cliente: string; modelo?: string; serie?: string; fecha?: string | null; protocolo?: string | null };
  inicial: Chequeo;
  /** Los datos de la hoja del informe (0417): modelo, serie y fecha se corrigen aquí y allá a la vez. */
  hoja: DatosHoja;
  editable: boolean;
  guardadoAt: string | null;
  /** Protocolo de un equipo en stock (0474): se guarda ahí, no en un pedido. */
  stockId?: string;
}) {
  const router = useRouter();
  const [ch, setCh] = useState<Chequeo>(inicial);
  const [cambiado, setCambiado] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const todas = useMemo(() => renglonesConMarca(plantilla), [plantilla]);
  const faltan = todas.filter((k) => !ch.marcas[k]).length;
  const fallas = todas.filter((k) => ch.marcas[k] === "falla").length;
  const noAplica = todas.filter((k) => ch.marcas[k] === "na").length;

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
  const restoNoAplica = (claves: string[]) =>
    cambiar((c) => ({ ...c, marcas: { ...c.marcas, ...Object.fromEntries(claves.filter((k) => !c.marcas[k]).map((k) => [k, "na" as const])) } }));

  // Lo que viene del informe también se corrige aquí mismo. Modelo, serie y
  // fecha se guardan en la hoja del informe (0417) para que las dos digan lo
  // mismo; cliente y N° de protocolo quedan escritos solo en esta hoja.
  const cap = (fijos.fecha ?? "").slice(0, 10);
  const inicialFijo: Record<string, string> = {
    "#cliente": inicial.datos.cliente ?? fijos.cliente,
    "#modelo": fijos.modelo ?? "",
    "#serie": fijos.serie ?? "",
    "#fecha": cap ? `${cap.slice(8, 10)}-${cap.slice(5, 7)}-${cap.slice(0, 4)}` : "",
    "#protocolo": inicial.datos.protocolo ?? fijos.protocolo ?? "",
  };
  const [fijo, setFijo] = useState(inicialFijo);
  const ponerFijo = (k: string, v: string) => {
    if (!editable) return;
    setFijo((f) => ({ ...f, [k]: v }));
    setCambiado(true);
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
    if (clave.startsWith("#")) return escrito(fijo[clave], (v) => ponerFijo(clave, v), { ayuda: clave === "#fecha" ? "dd-mm-aaaa" : undefined });
    if (clave === "voltaje+fases")
      return (
        <div className="flex flex-col print:flex-row print:items-center print:gap-3">
          <div className="w-full print:w-auto">{dato("voltaje", ayuda)}</div>
          <div className="w-full border-t border-neutral-300 print:w-auto print:border-0">{dato("fases", "Monofásico / Trifásico")}</div>
        </div>
      );
    return dato(clave, ayuda);
  };

  // «N/A»: el renglón no aplica a esta máquina (sin quemador, prueba solo con
  // agua…; Lesly, COFACO 13-10). Ocupa las dos casillas; tocarlo lo deja vacío.
  const casillas = (k: string) =>
    ch.marcas[k] === "na" ? (
      <td className={`${td} p-0 text-center`} colSpan={2}>
        <button
          type="button"
          disabled={!editable}
          aria-label="No aplica"
          onClick={() => marcar(k, "na")}
          className={`marca flex h-9 w-full items-center justify-center bg-neutral-100 text-[11px] font-bold text-neutral-600 ${editable ? "cursor-pointer hover:bg-neutral-200" : ""}`}
        >
          N/A
        </button>
      </td>
    ) : (
      (["ok", "falla"] as const).map((r) => (
        <td key={r} className={`${td} p-0 text-center`}>
          <button
            type="button"
            disabled={!editable}
            aria-label={r === "ok" ? "Conforme" : "Con falla"}
            onClick={() => marcar(k, r)}
            title={editable ? (r === "ok" ? "Marcar conforme ✓" : "Marcar con falla ✗") : undefined}
            className={`marca flex h-9 w-full items-center justify-center text-[16px] font-bold ${
              ch.marcas[k] === r
                ? r === "ok"
                  ? "bg-emerald-600 text-white print:bg-transparent print:text-black"
                  : "bg-red-600 text-white print:bg-transparent print:text-black"
                : editable
                  ? // VACÍA PERO QUE SE NOTE QUE SE TOCA (Ariana, 17-10: «no sé cómo
                    // poner checks»). Era un cuadro blanco al lado del campo de
                    // Observaciones, y el cursor de escribir la mandaba ahí.
                    // Primero se probó un ✓ verde tenue y se confundía con una
                    // casilla MARCADA (se veía «todo en verde» con 0 guardadas).
                    // Ahora: vacía = gris con borde punteado; marcada = llena,
                    // verde o roja, con la marca en blanco. En papel, en blanco.
                    `m-0.5 h-8 w-[calc(100%-4px)] rounded-sm border border-dashed border-neutral-400 text-[13px] text-neutral-300 ${
                      r === "ok" ? "hover:border-emerald-600 hover:text-emerald-600" : "hover:border-red-600 hover:text-red-600"
                    } print:border-0 print:text-transparent`
                  : ""
            } ${editable ? "cursor-pointer" : ""}`}
          >
            {ch.marcas[k] === r ? (r === "ok" ? "✓" : "✗") : editable ? (r === "ok" ? "✓" : "✗") : ""}
          </button>
        </td>
      ))
    );

  /** El nombre del renglón, con «N/A» al lado mientras esté vacío (no se imprime). */
  const renglon = (k: string, r: string) => (
    <td className={`${td} uppercase`}>
      <span className="flex items-center justify-between gap-1">
        <span>{r}</span>
        {editable && !ch.marcas[k] && (
          <button
            type="button"
            onClick={() => marcar(k, "na")}
            className="no-imprimir shrink-0 rounded border border-neutral-400 px-1 text-[10px] font-semibold normal-case text-neutral-600 hover:bg-neutral-100"
          >
            N/A
          </button>
        )}
      </span>
    </td>
  );

  const botonTodo = (claves: string[]) =>
    editable && claves.some((k) => !ch.marcas[k]) ? (
      <>
        <button type="button" onClick={() => todoBien(claves)} className="no-imprimir ml-2 rounded bg-emerald-700 px-2 py-0.5 text-[11px] font-semibold normal-case text-white">
          Todo ✓
        </button>
        <button
          type="button"
          onClick={() => restoNoAplica(claves)}
          className="no-imprimir ml-1 rounded border border-neutral-500 px-2 py-0.5 text-[11px] font-semibold normal-case text-neutral-700"
        >
          Lo que falta N/A
        </button>
      </>
    ) : null;

  const ponerProg = (k: string, v: string) => cambiar((c) => ({ ...c, prog: { ...c.prog, [k]: v } }));
  const prog = (k: string) => escrito(ch.prog[k], (v) => ponerProg(k, v), { max: 10, centro: true });

  // CANT. CON TEXTO O CON CHECK (Santos, 17-10: «a veces se pone texto y a
  // veces se pone check»). Clic derecho (o mantener apretado en la tablet)
  // pone ✓ en la casilla; otro clic derecho o un toque la devuelve a texto.
  const CHECK = "✓";
  const cant = (k: string) =>
    ch.prog[k] === CHECK ? (
      <button
        type="button"
        disabled={!editable}
        aria-label="Cantidad con check"
        title={editable ? "Toque o clic derecho para volver a escribir" : undefined}
        onClick={() => ponerProg(k, "")}
        onContextMenu={(e) => {
          e.preventDefault();
          ponerProg(k, "");
        }}
        className={`marca flex h-9 w-full items-center justify-center bg-emerald-100 text-[16px] font-bold text-emerald-800 ${editable ? "cursor-pointer hover:bg-emerald-200" : ""}`}
      >
        {CHECK}
      </button>
    ) : editable ? (
      <div
        title="Clic derecho: poner ✓"
        onContextMenu={(e) => {
          e.preventDefault();
          ponerProg(k, CHECK);
        }}
      >
        {prog(k)}
      </div>
    ) : (
      prog(k)
    );

  // La programación: de fábrica y de prueba, cada una con sus fases y el tiempo total (cantidad en gris, como el papel).
  const filasProgramacion = (["fabrica", "prueba"] as const).flatMap((tipo) => [
    { titulo: `PROGRAMACIÓN DE ${tipo === "fabrica" ? "FABRICA" : "PRUEBA"}`, k: null as string | null, total: false },
    ...[...(plantilla.programacion?.fases ?? []), "Tiempo total del ciclo"].map((f, i, todasF) => ({
      titulo: f,
      k: claveRenglon(`TIPO.${tipo}`, f),
      total: i === todasF.length - 1,
    })),
  ]);

  // En stock (0474) se guarda en el protocolo de stock; si no, en la máquina del pedido.
  const guardarDatos = (x: Record<string, string>) => (stockId ? datosDelProtocoloDeStock(stockId, x) : datosDelProtocolo(itemId, servicioId, maquina, x));
  const guardarChequeo = (x: Chequeo) => (stockId ? chequeoDelProtocoloDeStock(stockId, x) : chequeoDelProtocolo(itemId, servicioId, maquina, x));

  const guardar = () =>
    startTransition(async () => {
      // La fecha se escribe como en el papel (dd-mm-aaaa) y se guarda como fecha.
      const f = fijo["#fecha"].trim();
      const m = f.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
      if (f && !m) {
        toast.error("Escriba la fecha como en el papel: dd-mm-aaaa (por ejemplo 10-06-2026)");
        return;
      }
      const fecha = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : undefined;
      if (fijo["#modelo"] !== inicialFijo["#modelo"] || fijo["#serie"] !== inicialFijo["#serie"] || fijo["#fecha"] !== inicialFijo["#fecha"]) {
        const d = await guardarDatos({
          ...(hoja as Record<string, string>),
          modelo: fijo["#modelo"],
          serie: fijo["#serie"],
          fecha_ejecucion: fecha ?? "",
        });
        if (d.error) {
          toast.error(d.error, { duration: 9000 });
          return;
        }
      }
      const r = await guardarChequeo({
        ...ch,
        datos: { ...ch.datos, cliente: fijo["#cliente"], protocolo: fijo["#protocolo"] },
      });
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success(`Protocolo guardado · ${todas.length - faltan} de ${todas.length} casillas marcadas`);
      setCambiado(false);
      router.refresh();
    });

  const tabla = "w-full table-fixed border-collapse";

  return (
    <section className="hoja-chequeo mt-10 break-before-page border-t-2 border-dashed border-neutral-300 pt-8 font-[Arial,Helvetica,sans-serif] text-[12px] text-black print:mt-0 print:border-0 print:pt-0">
      {editable && (
        <p className="no-imprimir mb-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
          <b>Cómo se marca:</b> toque <b className="text-emerald-700">✓</b> (conforme) o <b className="text-red-600">✗</b> (con falla) en las dos columnas de la
          derecha, o «N/A» si no aplica. «Observaciones» es solo para escribir, si hace falta.
          {plantilla.programacion && <> En «CANT.» se escribe, o clic derecho (mantener apretado en la tablet) para poner <b className="text-emerald-700">✓</b>.</>} Al
          terminar, «Guardar protocolo» abajo.
        </p>
      )}
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
                    <td className={`${td} print:whitespace-nowrap ${c.etiqueta === c.etiqueta.toUpperCase() ? "font-bold" : ""}`}>{c.etiqueta}</td>
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
                      {renglon(k, r)}
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

      {/* COMPONENTES POR ENERGÍA (prensa, rodillo, calderín): se marca la columna que corresponde. */}
      {plantilla.porEnergia && (() => {
        const b = plantilla.porEnergia;
        return (
          <table className={`${tabla} -mt-px`}>
            <Columnas anchos={COLS_ENERGIA} />
            <tbody>
              <tr>
                <td className={`${td} text-center font-bold`} rowSpan={2}>
                  {b.titulo}
                </td>
                {b.energias.map((en) => (
                  <td key={en} className={`${td} text-center font-bold`} colSpan={2}>
                    {en === "ELECTRICO" ? "ELÉCTRICO" : en}
                    {editable && b.renglones.some((r) => !ch.marcas[claveEnergia(b.clave, r, en)]) && (
                      <button
                        type="button"
                        onClick={() => todoBien(b.renglones.map((r) => claveEnergia(b.clave, r, en)))}
                        className="no-imprimir mt-0.5 block w-full rounded bg-emerald-700 px-1 py-0.5 text-[10px] font-semibold text-white"
                      >
                        Todo ✓
                      </button>
                    )}
                  </td>
                ))}
                <td className={`${td} text-center font-bold`} rowSpan={2}>
                  OBSERVACIONES
                </td>
              </tr>
              <tr>
                {b.energias.map((en) => (
                  <Fragment key={en}>
                    <td className={`${td} text-center font-bold`}>✓</td>
                    <td className={`${td} text-center font-bold`}>✗</td>
                  </Fragment>
                ))}
              </tr>
              {b.renglones.map((r) => {
                const k = claveRenglon(b.clave, r);
                return (
                  <tr key={k}>
                    <td className={`${td} uppercase`}>{r}</td>
                    {b.energias.map((en) => (
                      <Fragment key={en}>{casillas(claveEnergia(b.clave, r, en))}</Fragment>
                    ))}
                    <td className={`${td} p-0 px-1`}>{escrito(ch.obs[k], (v) => cambiar((c) => ({ ...c, obs: { ...c.obs, [k]: v } })))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })()}

      {/* FUNCIONAMIENTO: EN VACÍO A LA IZQUIERDA, CON CARGA A LA DERECHA (no todos los papeles lo tienen) */}
      {plantilla.funcionamiento.length > 0 && (
      <table className={`${tabla} -mt-px`}>
        <Columnas anchos={COLS_MITADES} />
        <tbody>
          <tr>
            {(["vacio", "carga"] as const).map((modo) => (
              <Fragment key={modo}>
                <td className={`${td} font-bold`}>
                  {plantilla.modos?.[modo] ?? (modo === "vacio" ? "FUNCIONAMIENTO EN VACIO (CARGA 0)" : "FUNCIONAMIENTO CON CARGA")}
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
                  {renglon(claveRenglon(modo, r), r)}
                  {casillas(claveRenglon(modo, r))}
                </Fragment>
              ))}
            </tr>
          ))}

          {/* PROGRAMACIÓN (solo el papel de la lavadora la tiene) */}
          {plantilla.programacion && (
          <>
          <tr>
            {(["vacio", "carga"] as const).map((modo) => (
              <Fragment key={modo}>
                <td className={`${td} titulo-prog py-2 font-bold`}>{modo === "vacio" ? "PROGRAMACIÓN EN VACIO (CARGA 0)" : "PROGRAMACIÓN CON CARGA"}</td>
                <td className={`${td} px-0 text-center text-[10px] font-bold print:text-[8.5px]`}>CANT.</td>
                <td className={`${td} px-0 text-center text-[10px] font-bold print:text-[8.5px]`}>MIN.</td>
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
                    <td className={`${td} p-0 ${f.total ? gris : ""}`}>{k && !f.total ? cant(`${k}.cant`) : null}</td>
                    <td className={`${td} p-0`}>{k ? prog(`${k}.min`) : null}</td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
          </>
          )}
        </tbody>
      </table>
      )}

      {/* OBSERVACIONES */}
      <div className="observaciones -mt-px flex min-h-36 items-start gap-2 border border-black px-1 py-2">
        <span className="mt-1 shrink-0 font-bold">OBSERVACIONES:</span>
        {editable ? (
          <textarea
            rows={5}
            value={ch.datos.observaciones ?? ""}
            onChange={(e) => cambiar((c) => ({ ...c, datos: { ...c.datos, observaciones: e.target.value.slice(0, 1000) } }))}
            className="entrada block w-full resize-y bg-amber-50/60 px-1 py-1 text-[13px] outline-none focus:bg-amber-100"
          />
        ) : (
          <p className="mt-1 whitespace-pre-wrap">{ch.datos.observaciones ?? ""}</p>
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
            {faltan === todas.length
              ? Object.values(ch.prog).some((v) => v === "✓")
                ? "Programación con ✓ · eso ya cuenta como hoja marcada"
                : "Ninguna casilla marcada (marque al menos una)"
              : `${todas.length - faltan} de ${todas.length} casillas marcadas · solo las que correspondan`}
            {fallas > 0 && <b className="ml-2 text-red-700">· {fallas} con falla ✗</b>}
            {noAplica > 0 && <span className="ml-2 text-neutral-500">· {noAplica} N/A</span>}
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
          .hoja-chequeo .cc { height: 4.4mm; padding-top: 0; padding-bottom: 0; }
          .hoja-chequeo .titulo-prog { height: 7mm; }
          .hoja-chequeo .entrada, .hoja-chequeo .marca { height: auto; min-height: 0; background: transparent !important; font-size: 8.5px; padding: 0; color: #000; }
          .hoja-chequeo .marca { font-size: 10px; }
          .hoja-chequeo .entrada::placeholder { color: transparent; }
          .hoja-chequeo .bg-neutral-200 { background: #d9d9d9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .hoja-chequeo .observaciones { min-height: 32mm; }
          .hoja-chequeo textarea { resize: none; border: 0; overflow: hidden; padding: 0 3px !important; }
        }
      `}</style>
    </section>
  );
}
