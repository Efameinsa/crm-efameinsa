"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Check, Save, Mail, Send } from "lucide-react";
import { guardarAperturaServicio, marcarAperturaEnviada } from "@/lib/acciones/postventa";
import { enviarAperturaPorCorreo } from "@/lib/acciones/apertura-correo";
import { esCorreoDeLaEmpresa, type Destinatario } from "@/lib/directorio";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GUIAS_APERTURA, LOGISTICA_POR_DEFECTO, TIPOS_APERTURA, type GuiaApertura, type TipoApertura } from "@/lib/apertura-servicio";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";
import { ListaTecnicos, ID_LISTA_TECNICOS } from "@/components/crm/lista-tecnicos";

/**
 * Lo que hay que coordinar antes de que salga la apertura de servicio, y el
 * correo ya escrito.
 *
 * NO SE IMPRIME. Es la mesa de trabajo de postventa: acá se elige cuál de los
 * tres formatos es, se pone la hora y el día, quién va y cómo se mueve. La
 * hoja de arriba se rehace sola con lo que se guarde.
 *
 * El correo se copia, no se manda: el CRM no tiene SMTP y las alertas por
 * correo están apagadas por orden de gerencia. Es lo mismo que hace Central
 * con el WhatsApp de Tesorería — el sistema escribe el mensaje, la persona lo
 * pega y lo envía, y así ve lo que sale con su nombre.
 */
export function AperturaServicioPanel({
  servicioId,
  inicial,
  asunto,
  cuerpo,
  faltantes,
  enviadaAlmacenAt = null,
  enviadaClienteAt = null,
  destinatarios = [],
  empresaCorreo = "EFAMEINSA",
  empresaElegible = false,
}: {
  servicioId: string;
  inicial: {
    tipo: TipoApertura;
    fecha: string | null;
    hora: string | null;
    tecnico: string | null;
    transporte: string | null;
    nota: string | null;
    direccionFinal: string | null;
    destinoObservacion: string | null;
    guia: GuiaApertura | null;
    guiaDetalle: string | null;
    coordinaContabilidad: string | null;
    coordinaLogistica: string | null;
  };
  asunto: string;
  cuerpo: string;
  faltantes: string[];
  /** «Ya lo mandé»: cuándo se marcó el correo como enviado, al almacén y al cliente (0271). */
  enviadaAlmacenAt?: string | null;
  enviadaClienteAt?: string | null;
  /** Los que el directorio marca para almacén y Finanzas, en el correo de la empresa del pedido (0410). */
  destinatarios?: Destinatario[];
  empresaCorreo?: "EFAMEINSA" | "OPEN";
  /** Sin cierre de venta, postventa elige con qué empresa sale la apertura (0421, Rubí 09-10). */
  empresaElegible?: boolean;
}) {
  const [v, setV] = useState(inicial);
  const [empresa, setEmpresa] = useState<"EFAMEINSA" | "OPEN">(empresaCorreo);
  const [copiado, setCopiado] = useState<"asunto" | "cuerpo" | null>(null);
  const [guardando, empezar] = useTransition();
  const [enviando, empezarEnvio] = useTransition();
  const [enviada, setEnviada] = useState({ almacen: enviadaAlmacenAt, cliente: enviadaClienteAt });
  const router = useRouter();
  const [correoAbierto, setCorreoAbierto] = useState(false);
  const [mandando, empezarCorreo] = useTransition();
  const [lista, setLista] = useState<{ correo: string; nombre: string; area: string }[]>(
    destinatarios.map((d) => ({ correo: d.correo, nombre: d.nombre, area: d.area === "finanzas" ? "Finanzas" : "Almacén" })),
  );
  const [elegidos, setElegidos] = useState<Set<string>>(new Set(destinatarios.map((d) => d.correo)));
  const [otro, setOtro] = useState("");

  function agregarOtro() {
    const c = otro.trim().toLowerCase();
    if (!c) return;
    if (!esCorreoDeLaEmpresa(c)) {
      toast.error("Solo direcciones de la empresa (@efameinsa.com o @openinvestments.com.pe). Al cliente se le escribe desde su propio correo.");
      return;
    }
    if (!lista.some((x) => x.correo === c)) setLista((l) => [...l, { correo: c, nombre: "Agregado a mano", area: "—" }]);
    setElegidos((e) => new Set(e).add(c));
    setOtro("");
  }

  function enviarPorCorreo() {
    empezarCorreo(async () => {
      const r = await enviarAperturaPorCorreo(servicioId, [...elegidos]);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setCorreoAbierto(false);
      setEnviada((x) => ({ ...x, almacen: x.almacen ?? new Date().toISOString() }));
      const n = r.enviadoA?.length ?? 0;
      toast.success(`Correo enviado a ${n} ${n === 1 ? "persona" : "personas"}.${r.por === "gmail" ? " Salió por la cuenta de respaldo (la Gmail de la empresa)." : ""}`);
      router.refresh();
    });
  }

  function marcarEnviado(destino: "almacen" | "cliente") {
    empezarEnvio(async () => {
      const r = await marcarAperturaEnviada(servicioId, destino);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setEnviada((x) => ({ ...x, [destino]: new Date().toISOString() }));
      toast.success(destino === "almacen" ? "Enviada: el almacén y Finanzas ya recibieron el aviso en el CRM." : "Marcado: correo enviado al cliente.");
      router.refresh();
    });
  }

  const cambiar = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((x) => ({ ...x, [k]: e.target.value }));

  async function copiar(que: "asunto" | "cuerpo") {
    try {
      await navigator.clipboard.writeText(que === "asunto" ? asunto : cuerpo);
      setCopiado(que);
      toast.success(que === "asunto" ? "Asunto copiado." : "Correo copiado. Péguelo en Outlook o Gmail.");
      setTimeout(() => setCopiado(null), 2500);
    } catch {
      toast.error("No se pudo copiar. Selecciónelo y cópielo a mano.");
    }
  }

  function guardar() {
    empezar(async () => {
      const r = await guardarAperturaServicio(servicioId, {
        tipo: v.tipo,
        fecha: v.fecha,
        hora: v.hora,
        tecnico: v.tecnico,
        transporte: v.transporte,
        nota: v.nota,
        direccionFinal: v.direccionFinal,
        destinoObservacion: v.destinoObservacion,
        guia: v.guia,
        guiaDetalle: v.guia ? v.guiaDetalle : null,
        coordinaContabilidad: v.coordinaContabilidad,
        coordinaLogistica: v.coordinaLogistica,
        ...(empresaElegible ? { empresa } : {}),
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Guardado. La hoja de arriba ya quedó con estos datos.");
      router.refresh();
    });
  }

  return (
    <div className="no-imprimir space-y-4">
      {/* ── Qué falta para que el correo salga completo ── */}
      {faltantes.length > 0 ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <b>Falta llenar:</b> {faltantes.join(", ")}. El correo se puede copiar igual — lo que falte aparece
          como «—», no se inventa.
        </p>
      ) : (
        <p className="rounded-md border border-[#1E7F4F]/40 bg-[#1E7F4F]/5 px-3 py-2 text-xs font-medium text-[#1E7F4F]">
          La apertura está completa.
        </p>
      )}

      {/* ── La mesa de trabajo ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Datos que se coordinan</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Todo lo demás —cliente, RUC, dirección, quién recibe, el equipo con su serie— sale solo de lo que ya
          está en el sistema.
        </p>

        <fieldset className="mt-3">
          <legend className="mb-1.5 text-xs font-medium text-foreground">¿Qué se va a hacer?</legend>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            {TIPOS_APERTURA.map((t) => (
              <label
                key={t.clave}
                className={cn(
                  "cursor-pointer rounded-md border p-2.5 transition-colors",
                  v.tipo === t.clave ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                )}
              >
                <input
                  type="radio"
                  name="tipo-apertura"
                  className="sr-only"
                  checked={v.tipo === t.clave}
                  onChange={() => setV((x) => ({ ...x, tipo: t.clave }))}
                />
                <span className="block text-[11px] font-bold uppercase tracking-wide text-foreground">{t.titulo}</span>
                <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{t.ayuda}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {empresaElegible && (
            <Campo ancho etiqueta="Empresa con la que sale la apertura" ayuda="Este pedido no viene de un cierre: elija la empresa. Con cierre, sale la del cierre.">
              <select value={empresa} onChange={(e) => setEmpresa(e.target.value as "EFAMEINSA" | "OPEN")} className={ENTRADA}>
                <option value="EFAMEINSA">CORPORACIÓN EFAMEINSA S.A.</option>
                <option value="OPEN">OPEN INVESTMENTS S.A.C.</option>
              </select>
            </Campo>
          )}
          <Campo etiqueta="Día del servicio">
            <input type="date" value={v.fecha ?? ""} onChange={cambiar("fecha")} className={ENTRADA} />
          </Campo>
          <Campo etiqueta="Hora">
            <input type="time" value={v.hora?.slice(0, 5) ?? ""} onChange={cambiar("hora")} className={ENTRADA} />
          </Campo>
          <Campo etiqueta="Personal asignado (técnico)" ayuda="En una entrega por agencia no va nadie: se puede dejar vacío.">
            <input
              value={v.tecnico ?? ""}
              onChange={cambiar("tecnico")}
              placeholder="Elija de la relación de técnicos o escriba"
              className={ENTRADA}
              list={ID_LISTA_TECNICOS}
            />
            <ListaTecnicos />
          </Campo>
          <Campo etiqueta="Medio de transporte del técnico">
            <input
              value={v.transporte ?? ""}
              onChange={cambiar("transporte")}
              placeholder="ej. TRANSPORTE CONTRATADO"
              className={ENTRADA}
              list="transportes-usados"
            />
            <datalist id="transportes-usados">
              <option value="TRANSPORTE CONTRATADO" />
              <option value="TRANSPORTE CONTRATADO POR EL CLIENTE" />
              <option value="MOVILIDAD PROPIA" />
            </datalist>
          </Campo>
          {/* Lesly, 02-10: «que tenga ese campo ya para solicitar la guía».
              Antes se escribía a mano en la nota, cada vez con otras palabras. */}
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-xs font-medium text-foreground">¿Se solicita guía?</legend>
            <div className="flex flex-wrap gap-1.5">
              {[{ clave: null, etiqueta: "No se pide guía" }, ...GUIAS_APERTURA].map((g) => (
                <label
                  key={g.clave ?? "ninguna"}
                  className={cn(
                    "cursor-pointer rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                    v.guia === g.clave ? "border-primary bg-primary/5 font-semibold text-foreground" : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  <input
                    type="radio"
                    name="guia-apertura"
                    className="sr-only"
                    checked={v.guia === g.clave}
                    onChange={() => setV((x) => ({ ...x, guia: g.clave }))}
                  />
                  {g.etiqueta}
                </label>
              ))}
            </div>
            {v.guia && (
              <input
                value={v.guiaDetalle ?? ""}
                onChange={cambiar("guiaDetalle")}
                placeholder={
                  v.guia === "traslado"
                    ? "Precisión (opcional)"
                    : v.guia === "repuestos"
                      ? "Qué repuestos lleva (opcional), ej. manómetro (posible venta)"
                      : "Qué materiales lleva (opcional), ej. tubería de cobre y conexiones"
                }
                className={cn(ENTRADA, "mt-1.5")}
              />
            )}
          </fieldset>
          <Campo etiqueta="Notas" ayuda="Van en el apartado NOTAS de «Servicio a realizar», debajo de la guía." ancho>
            <input
              value={v.nota ?? ""}
              onChange={cambiar("nota")}
              placeholder="ej. llevar escalera; el cliente pide llamar antes de llegar"
              className={ENTRADA}
            />
          </Campo>
          <Campo
            etiqueta="Contabilidad: con quién coordina el técnico"
            ayuda="Movilidad y viáticos. Nombre y/o número. Si se deja vacío, sale quien confirmó el pago."
          >
            <input
              value={v.coordinaContabilidad ?? ""}
              onChange={cambiar("coordinaContabilidad")}
              placeholder="ej. Jhon Kalsin · 9XX XXX XXX"
              className={ENTRADA}
            />
          </Campo>
          <Campo
            etiqueta="Logística: con quién coordina"
            ayuda={`Herramientas, repuestos y EPP. Si se deja vacío, sale «${LOGISTICA_POR_DEFECTO}».`}
          >
            <input
              value={v.coordinaLogistica ?? ""}
              onChange={cambiar("coordinaLogistica")}
              placeholder={`ej. ${LOGISTICA_POR_DEFECTO} · 9XX XXX XXX`}
              className={ENTRADA}
            />
          </Campo>
          <Campo
            etiqueta="Dirección final"
            ayuda="Solo si la entrega es en nuestras instalaciones y el equipo sigue viaje después."
            ancho
          >
            <input
              value={v.direccionFinal ?? ""}
              onChange={cambiar("direccionFinal")}
              placeholder="ej. LOTE 14 TOMA DE BAUTISTA, GROCIO PRADO – CHINCHA – ICA"
              className={ENTRADA}
            />
          </Campo>
          {/* Rubí, 03-10: «en la parte de destino debería ir una opción para observación,
              para detallar la sede o dirección de la agencia en destino». */}
          <Campo
            etiqueta="Observación del destino"
            ayuda="La sede o la dirección de la agencia en destino adonde tiene que llegar el pedido. Sale en la fila «Destino final», en observaciones."
            ancho
          >
            <textarea
              value={v.destinoObservacion ?? ""}
              onChange={cambiar("destinoObservacion")}
              rows={2}
              placeholder="ej. Recoge en Espinoza Cargo, sede El Tambo: Av. Huancavelica 1250 – Huancayo"
              className={ENTRADA}
            />
          </Campo>
        </div>

        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:bg-primary/90 disabled:opacity-70"
        >
          <Save className="size-3.5" /> {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {/* ── El correo, listo ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Mail className="size-4" /> El correo, ya escrito
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Envíelo desde aquí —sale desde gestion1@efameinsa.com y las respuestas le llegan a usted— o cópielo y
          péguelo en Outlook. Revíselo antes de enviar.
        </p>

        <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Asunto</label>
        <div className="mt-1 flex gap-2">
          <input readOnly value={asunto} className={cn(ENTRADA, "font-medium")} />
          <button type="button" onClick={() => copiar("asunto")} className={BOTON_COPIAR}>
            {copiado === "asunto" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        </div>

        <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Mensaje</label>
        <textarea
          readOnly
          value={cuerpo}
          rows={14}
          className="mt-1 w-full rounded-md border border-input bg-background p-2.5 font-mono text-[11.5px] leading-relaxed outline-none"
        />
        <button
          type="button"
          onClick={() => copiar("cuerpo")}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent"
        >
          <Copy className="size-3.5" /> {copiado === "cuerpo" ? "Copiado" : "Copiar el correo"}
        </button>
        <button
          type="button"
          onClick={() => setCorreoAbierto(true)}
          className="ml-2 mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Mail className="size-3.5" /> Enviar por correo
        </button>

        <Dialog open={correoAbierto} onOpenChange={setCorreoAbierto}>
          <DialogContent className="sm:max-w-lg">
            <DialogTitle>Enviar la apertura por correo</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Sale desde <b>gestion1@efameinsa.com</b> con las 11 filas del formato (el técnico con su DNI), en el correo de{" "}
              {empresaCorreo === "OPEN" ? "OPEN" : "EFAMEINSA"}. Las respuestas le llegan a usted. Solo a direcciones de la
              empresa: lo del cliente se envía aparte.
            </p>
            {lista.length === 0 && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                El directorio no tiene a nadie marcado para los avisos de almacén y Finanzas. Agregue las direcciones abajo.
              </p>
            )}
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {lista.map((x) => (
                <li key={x.correo}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-2.5 py-2 text-sm hover:bg-accent">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={elegidos.has(x.correo)}
                      onChange={(e) =>
                        setElegidos((prev) => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(x.correo);
                          else n.delete(x.correo);
                          return n;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">
                        {x.nombre} <span className="text-xs font-normal text-muted-foreground">· {x.area}</span>
                      </span>
                      <span className="block break-all text-xs text-muted-foreground">{x.correo}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                value={otro}
                onChange={(e) => setOtro(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    agregarOtro();
                  }
                }}
                placeholder="Agregar otra dirección de la empresa"
                type="email"
                className="h-9"
              />
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={agregarOtro}>
                Agregar
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {elegidos.size} {elegidos.size === 1 ? "destinatario" : "destinatarios"} · copia oculta a gestion1@
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setCorreoAbierto(false)} disabled={mandando}>
                  Cancelar
                </Button>
                <Button onClick={enviarPorCorreo} disabled={mandando || elegidos.size === 0}>
                  {mandando ? "Enviando…" : "Enviar correo"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* «YA LO MANDÉ» (0271, ítem 8 de la reunión del 22-09): el CRM copia
            el correo pero no lo envía —no tiene SMTP—, así que hasta ahora no
            quedaba registro de que alguien de verdad lo mandó. Dos marcas
            porque son dos destinatarios distintos, con contenido distinto de
            interesados: el almacén despacha con esto, el cliente coordina la
            recepción. */}
        {/* Santos, 24-09: la apertura de despacho es para el almacén; «enviar al
            cliente» no va en esta vista. */}
        <div className="mt-3 border-t border-border pt-3">
          {/* Desde el 25-09 (audio de gerencia) el envío llega de verdad: aviso al
              almacén para preparar y a Finanzas para que confirme la guía. */}
          <BotonEnviado
            etiqueta="Al almacén y a Finanzas"
            enviadoAt={enviada.almacen}
            disabled={enviando}
            onClick={() => marcarEnviado("almacen")}
          />
        </div>
      </div>
    </div>
  );
}

const ENTRADA =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground";
const BOTON_COPIAR =
  "inline-flex shrink-0 items-center rounded-md border border-border px-3 text-foreground hover:bg-accent";

function Campo({
  etiqueta,
  ayuda,
  ancho,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  ancho?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={ancho ? "sm:col-span-2" : undefined}>
      <label className="mb-1 block text-xs font-medium text-foreground">{etiqueta}</label>
      {children}
      {ayuda && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

function BotonEnviado({
  etiqueta,
  enviadoAt,
  disabled,
  onClick,
}: {
  etiqueta: string;
  enviadoAt: string | null;
  disabled: boolean;
  onClick: () => void;
}) {
  if (enviadoAt) {
    return (
      <p className="flex items-center gap-1.5 rounded-md border border-[#1E7F4F]/40 bg-[#1E7F4F]/5 px-3 py-2 text-xs font-medium text-[#1E7F4F]">
        <Check className="size-3.5 flex-none" /> {etiqueta}: enviado {fechaHoraLima(enviadoAt)}
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-60"
    >
      <Send className="size-3.5" /> Enviar — {etiqueta}
    </button>
  );
}
