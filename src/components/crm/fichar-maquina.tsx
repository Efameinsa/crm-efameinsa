"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Plus } from "lucide-react";
import { buscarClientes } from "@/lib/acciones/casos";
import { modelosDelCatalogo, registrarEquipo } from "@/lib/acciones/equipos";
import { ficharEquipoDeLaAtencion } from "@/lib/acciones/atenciones";
import { ModeloDeMaquina } from "@/components/crm/modelo-de-maquina";
import type { ModeloCatalogo } from "@/lib/modelos-catalogo";
import { cn } from "@/lib/utils";

/**
 * Fichar una máquina en el parque instalado (0181).
 *
 * El mismo formulario sirve en los dos lugares donde hacía falta y no existía:
 *
 *  · DENTRO DE UNA ATENCIÓN, cuando el cliente no tiene ninguna máquina y el
 *    panel de las series sale vacío. Ahí el cliente ya se sabe, así que no se
 *    pregunta: se ficha la máquina y queda vinculada con la garantía
 *    verificada, que es lo que hacía el clic del panel.
 *
 *  · EN EL PARQUE INSTALADO, para dar de alta a mano lo que ya está en la
 *    calle: las ventas viejas, y las máquinas que aparezcan cuando lleguen las
 *    guías de remisión.
 *
 * LA SERIE ES OPCIONAL, y está dicho en la pantalla. Se pide siempre —es la
 * identidad de la máquina— pero la foto de la placa llega cuando llega, y la
 * atención no puede esperar a eso. Sin serie la máquina queda fichada igual,
 * lista para completarla después.
 *
 * REUNIÓN 28-09: el modelo sugiere los equipos del catálogo mientras se
 * escribe (y admite texto libre), y la fecha es la del DESPACHO —la guía de
 * remisión—, «de ahí corre la garantía»: «no es la fecha de compra, es la
 * fecha de la guía… solamente hay que cambiar el nombre». El dato es el mismo.
 */
export function FicharMaquina({
  atencionId,
  cuenta,
  alTerminar,
}: {
  /** Si viene de una atención, la máquina queda vinculada a ella. */
  atencionId?: string;
  /** Cliente ya conocido. Si no viene, se pregunta acá. */
  cuenta?: { id: string; razonSocial: string } | null;
  alTerminar?: () => void;
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();

  const [elegida, setElegida] = useState(cuenta ?? null);
  const [texto, setTexto] = useState("");
  const [candidatas, setCandidatas] = useState<{ id: string; razonSocial: string; documento: string | null }[]>([]);

  // VARIAS MÁQUINAS DE UNA VEZ (gerencia, 28-09, con BUNGARENA: «faltaba
  // agregar acá otra serie más porque son dos equipos… no hay manera de
  // agregar más». Carlos: «vas a poder agregar uno, dos, diez, cien equipos»).
  // La primera queda como la principal del caso; las demás, como otras
  // máquinas del mismo caso (0253). Fecha, garantía y ubicación son comunes:
  // casi siempre salieron juntas en el mismo pedido.
  const vacia = { serie: "", modelo: "", productoId: null as string | null };
  const [maquinas, setMaquinas] = useState<{ serie: string; modelo: string; productoId: string | null }[]>([vacia]);
  const cambiar = (i: number, cambios: Partial<(typeof maquinas)[number]>) =>
    setMaquinas((ms) => ms.map((m, j) => (j === i ? { ...m, ...cambios } : m)));
  // Los equipos del catálogo, una sola vez por formulario, para sugerir el modelo.
  const [catalogo, setCatalogo] = useState<ModeloCatalogo[]>([]);
  useEffect(() => {
    let vivo = true;
    modelosDelCatalogo()
      .then((l) => vivo && setCatalogo(l))
      .catch(() => {
        /* sin sugerencias se escribe a mano, como antes */
      });
    return () => {
      vivo = false;
    };
  }, []);
  const [fecha, setFecha] = useState("");
  const [meses, setMeses] = useState("24");
  const [ubicacion, setUbicacion] = useState("");
  // ¿LA VENDIMOS NOSOTROS? (reunión 25-09, Ruby: «esa máquina no la
  // compraron aquí, llegó solo por servicio técnico… busqué todo el file y
  // nunca hubo fecha de compra»). Si vino de afuera, no hay fecha de compra
  // ni garantía nuestra: se pide desde cuándo la conocemos (la primera vez
  // que llegó a la planta) y queda anotado en la máquina.
  const [origen, setOrigen] = useState<"nuestra" | "servicio">("nuestra");

  function mirarClientes() {
    if (texto.trim().length < 3) {
      toast.info("Escriba al menos tres letras del nombre o del RUC");
      return;
    }
    empezar(async () => {
      const r = await buscarClientes(texto);
      setCandidatas(r);
      if (r.length === 0) toast.info("Ningún cliente casa con eso");
    });
  }

  function guardar() {
    empezar(async () => {
      const deAfuera = origen === "servicio";
      const observaciones = deAfuera
        ? `No la vendimos: vino solo por servicio técnico.${fecha ? ` Llegó por primera vez a la planta el ${fecha.split("-").reverse().join("/")}.` : ""}`
        : null;
      // Una por una y en orden: la primera se vuelve la principal del caso y
      // para las siguientes la acción ya la encuentra puesta.
      const aGuardar = maquinas.filter((m) => m.modelo.trim().length >= 3);
      let hechas = 0;
      for (const m of aGuardar) {
        const comun = {
          serie: m.serie.trim() || null,
          modelo: m.modelo,
          productoId: m.productoId,
          fechaCompra: deAfuera ? null : fecha || null,
          garantiaMeses: deAfuera ? 0 : Number(meses) || 24,
          ubicacion: ubicacion.trim() || null,
        };
        const r = atencionId
          ? await ficharEquipoDeLaAtencion({ atencionId, ...comun, observaciones })
          : await registrarEquipo({ cuentaId: elegida?.id ?? "", ...comun });
        if (r.error) {
          toast.error(`${m.serie.trim() || m.modelo}: ${r.error}`);
          // Lo que ya se guardó no se repite: quedan en el formulario solo las que faltan.
          setMaquinas(aGuardar.slice(hechas));
          if (hechas) router.refresh();
          return;
        }
        hechas++;
      }
      toast.success(
        atencionId
          ? `${hechas === 1 ? "Máquina fichada" : `${hechas} máquinas fichadas`} — garantía verificada`
          : `${hechas === 1 ? "Máquina registrada" : `${hechas} máquinas registradas`} en el parque instalado`,
      );
      setMaquinas([vacia]); setFecha(""); setUbicacion(""); setOrigen("nuestra");
      alTerminar?.();
      router.refresh();
    });
  }

  const listo =
    maquinas.some((m) => m.modelo.trim().length >= 3) &&
    maquinas.every((m) => !m.serie.trim() || m.modelo.trim().length >= 3) &&
    (atencionId || elegida);

  return (
    <div className="space-y-4">
      {/* De quién es: solo cuando no se sabe todavía. */}
      {!atencionId && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">¿De qué cliente es?</p>
          {elegida ? (
            <p className="text-xs font-semibold text-foreground">
              {elegida.razonSocial}{" "}
              <button
                type="button"
                onClick={() => setElegida(null)}
                className="cursor-pointer font-normal text-primary underline"
              >
                cambiar
              </button>
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
                  <Search className="size-3.5 flex-none text-muted-foreground" />
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), mirarClientes())}
                    placeholder="Razón social o RUC"
                    className="w-full min-w-[160px] bg-transparent text-sm outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={mirarClientes}
                  disabled={pendiente}
                  className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                >
                  Buscar
                </button>
              </div>
              {candidatas.length > 0 && (
                <div className="space-y-1">
                  {candidatas.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setElegida({ id: c.id, razonSocial: c.razonSocial }); setCandidatas([]); }}
                      className="block w-full cursor-pointer rounded border border-border bg-background px-2 py-1 text-left text-xs hover:bg-accent"
                    >
                      {c.razonSocial}
                      {c.documento && <span className="ml-1 text-muted-foreground">· {c.documento}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* UNA TARJETA POR MÁQUINA, con su número arriba (reunión 28-09: «está
          muy pequeño… tiene que estar mejor maquetado»). Serie y modelo lado a
          lado cuando hay ancho; uno debajo del otro cuando no. */}
      <div className="space-y-3">
        {maquinas.map((m, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-border bg-card p-3">
            {maquinas.length > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Máquina {i + 1}</p>
                <button
                  type="button"
                  onClick={() => setMaquinas((ms) => ms.filter((_, j) => j !== i))}
                  className="cursor-pointer rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-destructive"
                  aria-label={`Quitar la máquina ${i + 1}`}
                >
                  Quitar
                </button>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
              <label className="block space-y-1.5">
                <span className="block text-sm font-medium text-foreground">
                  Número de serie <span className="font-normal text-muted-foreground">— si ya se tiene</span>
                </span>
                <input
                  value={m.serie}
                  onChange={(e) => cambiar(i, { serie: e.target.value })}
                  placeholder="Como se lee en la placa"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:border-primary"
                />
              </label>
              <ModeloDeMaquina
                etiqueta="Modelo de la máquina"
                valor={m.modelo}
                catalogo={catalogo}
                onCambiar={(texto, producto) => cambiar(i, { modelo: texto, productoId: producto?.id ?? null })}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setMaquinas((ms) => [...ms, vacia])}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent"
        >
          <Plus className="size-4" /> Agregar otra máquina
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {atencionId && (
          <div className="space-y-1.5 md:col-span-2">
            <span className="block text-sm font-medium text-foreground">¿La vendimos nosotros?</span>
            <div className="flex flex-wrap gap-1.5">
              {([
                ["nuestra", "Sí, es una venta nuestra"],
                ["servicio", "No: vino solo por servicio técnico"],
              ] as const).map(([v, t]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={origen === v}
                  onClick={() => setOrigen(v)}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors",
                    origen === v ? "border-primary bg-primary font-medium text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="block space-y-1.5">
          <span className="block text-sm font-medium text-foreground">
            {origen === "servicio" ? (
              <>
                Llegó por primera vez a la planta <span className="font-normal text-muted-foreground">— desde cuándo la atendemos</span>
              </>
            ) : (
              <>
                Fecha de despacho (guía de remisión){" "}
                <span className="font-normal text-muted-foreground">— de ahí corre la garantía</span>
              </>
            )}
          </span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={cn("block space-y-1.5", origen === "servicio" && "hidden")}>
            <span className="block text-sm font-medium text-foreground">Garantía (meses)</span>
            <input
              type="number"
              min={0}
              max={120}
              value={meses}
              onChange={(e) => setMeses(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="block text-sm font-medium text-foreground">Dónde está</span>
            <input
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
              placeholder="Sede, piso"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {origen === "servicio"
          ? "Como no la vendimos, no tiene garantía nuestra: queda anotado que vino solo por servicio técnico y desde cuándo la conocemos."
          : "Sin la fecha de la guía la garantía queda sin calcular: la máquina se ficha igual y la fecha se completa cuando aparezca su guía de remisión."}
      </p>

      <button
        type="button"
        onClick={guardar}
        disabled={pendiente || !listo}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground",
          "hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <Plus className="size-3.5" />
        {atencionId
          ? maquinas.length > 1
            ? `Fichar las ${maquinas.length} máquinas y verificar la garantía`
            : "Fichar la máquina y verificar la garantía"
          : maquinas.length > 1
            ? `Registrar las ${maquinas.length} máquinas`
            : "Registrar la máquina"}
      </button>
    </div>
  );
}
