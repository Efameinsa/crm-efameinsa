"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PhoneForwarded, Siren } from "lucide-react";
import { datosParaFormatoDeLlamada, enviarAperturaLlamada } from "@/lib/acciones/aperturas-llamada";
import { buscarEmpresaParaVisita } from "@/lib/acciones/visitas-planta";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import { ETIQUETA_TIPO_APERTURA, TIPOS_APERTURA, type FormatoLlamada, type TipoApertura } from "@/lib/aperturas-llamada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * «ENVIAR APERTURA» (0281, reunión 23-09).
 *
 * Lo que postventa mandaba por correo al almacén, hecho acá: el tipo de
 * llamada o de atención, los equipos (con su serie si la tiene), el día y la
 * hora que se le dio al cliente y lo que hay que revisar. Sale desde el pedido
 * y también desde la ficha del cliente, para el cliente de hace años que no
 * tiene pedido (Rubí: «la apertura solo se realiza en los pedidos»).
 *
 * LA APERTURA URGENTE (0295; Carlos, 23-09 17:24). El cliente pide que vaya el
 * técnico ya y promete comprar: «no hay cotización, no hay cierre, no hay
 * nada… permíteme hacer mi apertura de manera directa… para poder guardar,
 * pide el PIN». Sin pedido, marcada urgente y con el código de gerencia; al
 * almacén le llega como URGENTE. Sin `cuentaId`, el diálogo pide el cliente.
 *
 * EL TÉCNICO Y EL FORMATO DE LLAMADA (0297; Santos, 24-09). El técnico lo
 * pone postventa, no el almacén. Y la orden sigue el formato de siempre
 * (compra, entrega y guía, contacto, problema, mantenimiento, protocolo,
 * garantía, provincia, puesta en marcha, cambios correctivos): al elegir la
 * máquina del parque se llena sola; lo que falte se escribe.
 */
type EquipoParque = Awaited<ReturnType<typeof datosParaFormatoDeLlamada>>["equipos"][number];
const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const RE_CAMPO: Record<"MARCA" | "MODELO", RegExp> = {
  MARCA: /MARCA\s*:?\s*([^\n]+?)(?=\s+[A-ZÁÉÍÓÚ]{4,}\s*:|\n|$)/i,
  MODELO: /MODELO\s*:?\s*([^\n]+?)(?=\s+[A-ZÁÉÍÓÚ]{4,}\s*:|\n|$)/i,
};
const extraer = (texto: string | null, clave: "MARCA" | "MODELO") => texto?.match(RE_CAMPO[clave])?.[1]?.trim() ?? "";

function formatoDesdeEquipo(e: EquipoParque): FormatoLlamada {
  const garantia = e.garantia_meses ? `${e.garantia_meses} MESES${e.garantia_hasta ? ` (hasta el ${dmy(e.garantia_hasta)})` : ""}` : "";
  return {
    fecha_compra: dmy(e.fecha_venta),
    entrega_guia: [dmy(e.fecha_despacho), e.guia_remision ? `Guía ${e.guia_remision}` : ""].filter(Boolean).join(" · "),
    marca: extraer(e.modelo_texto, "MARCA"),
    modelo: extraer(e.modelo_texto, "MODELO"),
    serie: e.serie ?? "",
    fecha_mantenimiento: e.ultimo_mantenimiento ? dmy(e.ultimo_mantenimiento) : "NINGUNO",
    protocolo: e.protocolo ? "SÍ" : "NO",
    garantia,
    provincia: e.ubicacion ?? "",
    puesta_en_marcha: e.fecha_puesta_marcha ? dmy(e.fecha_puesta_marcha) : "NO SE HIZO",
  };
}
export function AperturaLlamadaBoton({
  cuentaId: cuentaFija = null,
  servicioId = null,
  atencionId = null,
  equipos = "",
  contacto = "",
  tipo: tipoInicial = "videollamada_preinstalacion",
  etiqueta = "Derivar llamada",
  compacto = false,
  urgenteInicial = false,
  problema = "",
}: {
  cuentaId?: string | null;
  servicioId?: string | null;
  atencionId?: string | null;
  equipos?: string;
  contacto?: string;
  tipo?: TipoApertura;
  etiqueta?: string;
  compacto?: boolean;
  /** Abre ya marcada como urgente (el botón de «Aperturas urgentes»). */
  urgenteInicial?: boolean;
  /** Lo que reportó el cliente, para no volver a escribirlo (caso técnico, 25-09). */
  problema?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const manana = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [tipo, setTipo] = useState<TipoApertura>(tipoInicial);
  const [fecha, setFecha] = useState(manana);
  const [hora, setHora] = useState("10:00");
  const [texto, setTexto] = useState(equipos);
  const [indicaciones, setIndicaciones] = useState(problema);
  const [persona, setPersona] = useState(contacto);
  const [contactos, setContactos] = useState<{ texto: string; operativo: boolean }[]>([]);
  const [urgente, setUrgente] = useState(urgenteInicial);
  const [pin, setPin] = useState("");
  const [cuenta, setCuenta] = useState<{ id: string; nombre: string } | null>(null);
  const [tecnico, setTecnico] = useState("");
  const [formato, setFormato] = useState<FormatoLlamada>({});
  const [parque, setParque] = useState<EquipoParque[] | null>(null);
  // Varias máquinas a la vez (Gabriela, 25-09: «son 2 máquinas que el técnico va a evaluar y no
  // puedo añadir la segunda»).
  const [elegidas, setElegidas] = useState<string[]>([]);
  const campoFormato = (clave: keyof FormatoLlamada) => ({
    value: formato[clave] ?? "",
    onChange: (e: { target: { value: string } }) => setFormato((f) => ({ ...f, [clave]: e.target.value })),
  });
  const [busca, setBusca] = useState("");
  const [opciones, setOpciones] = useState<{ id: string; razon_social: string; num_doc: string | null }[]>([]);
  const cuentaId = cuentaFija ?? cuenta?.id ?? null;
  const puedeUrgente = !servicioId;

  // EL BORRADOR (Rubí, 01-10, CONGELADOS Y FRESCOS): llenó la ventana, no llegó
  // a enviarse y al cerrarla se perdió todo. Lo escrito se guarda en este
  // navegador mientras no se envíe; al volver a abrir se ofrece recuperarlo.
  const claveBorrador = `crm:derivar-llamada:${cuentaFija ?? "elegir-cliente"}:${servicioId ?? atencionId ?? "ficha"}`;
  type Borrador = {
    tipo: TipoApertura; fecha: string; hora: string; texto: string; indicaciones: string; persona: string;
    tecnico: string; formato: FormatoLlamada; elegidas: string[]; cuenta: { id: string; nombre: string } | null; at: string;
  };
  const [ofrecido, setOfrecido] = useState<Borrador | null>(null);
  const escribio =
    texto.trim() !== equipos.trim() || indicaciones.trim() !== problema.trim() || persona.trim() !== contacto.trim() || tecnico.trim() !== "";

  useEffect(() => {
    // Mientras se ofrece el anterior no se pisa: primero se recupera o se descarta.
    if (!abierto || ofrecido || !escribio) return;
    const t = setTimeout(() => {
      try {
        const b: Borrador = { tipo, fecha, hora, texto, indicaciones, persona, tecnico, formato, elegidas, cuenta, at: new Date().toISOString() };
        localStorage.setItem(claveBorrador, JSON.stringify(b));
      } catch {
        /* sin almacenamiento: se sigue sin borrador */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [abierto, ofrecido, escribio, claveBorrador, tipo, fecha, hora, texto, indicaciones, persona, tecnico, formato, elegidas, cuenta]);

  function recuperar(b: Borrador) {
    setTipo(b.tipo);
    setFecha(b.fecha);
    setHora(b.hora);
    setTexto(b.texto);
    setIndicaciones(b.indicaciones);
    setPersona(b.persona);
    setTecnico(b.tecnico);
    setFormato(b.formato ?? {});
    setElegidas(b.elegidas ?? []);
    if (!cuentaFija && b.cuenta) setCuenta(b.cuenta);
    setOfrecido(null);
  }
  function descartar() {
    try {
      localStorage.removeItem(claveBorrador);
    } catch {}
    setOfrecido(null);
  }

  // Cerrar sin enviar no es enviar: se dice, para que nadie se quede con la
  // idea de que el almacén ya la tiene.
  function cambiarAbierto(v: boolean) {
    if (v) {
      try {
        const b = JSON.parse(localStorage.getItem(claveBorrador) ?? "null") as Borrador | null;
        setOfrecido(b && b.at ? b : null);
      } catch {
        setOfrecido(null);
      }
    }
    if (!v && !pendiente && escribio) {
      toast.warning("No se envió al almacén", {
        description: "Lo que escribió quedó guardado en esta computadora: al volver a abrir «Derivar llamada» puede recuperarlo.",
        duration: 10000,
      });
    }
    setAbierto(v);
  }

  // Lo que falta, dicho en el pie: el botón ya no se apaga sin explicar por qué.
  const falta = [
    !cuentaId && "el cliente",
    !texto.trim() && ((parque?.length ?? 0) > 0 ? "marcar la máquina (o escribir el equipo)" : "escribir el equipo"),
    !fecha && "el día",
    !hora && "la hora",
    persona.replace(/\D/g, "").length < 6 && "a quién llama el almacén, con su celular",
    // Lesly (03-10): enviaban sin técnico y el almacén no podía ponerlo.
    !tecnico.trim() && "el técnico a cargo",
    urgente && pin.replace(/\D/g, "").length < 4 && "el código de gerencia",
  ].filter(Boolean) as string[];
  // Lo que queda vacío del formato no frena el envío (no siempre se sabe), pero se dice:
  // la orden sale con «—» y el almacén no tiene a quién preguntar.
  const vaciosFormato = (
    [
      ["fecha_compra", "fecha de compra"],
      ["marca", "marca"],
      ["modelo", "modelo"],
      ["serie", "serie"],
      ["protocolo", "protocolo"],
      ["garantia", "garantía"],
      ["cambios_correctivos", "cambios correctivos"],
    ] as [keyof FormatoLlamada, string][]
  )
    .filter(([k]) => !(formato[k] ?? "").trim())
    .map(([, e]) => e);

  // Al abrir (o al elegir el cliente) se traen sus máquinas para el formato.
  useEffect(() => {
    if (!abierto || !cuentaId) return;
    let vigente = true;
    datosParaFormatoDeLlamada(cuentaId).then((d) => {
      if (!vigente) return;
      setParque(d.equipos);
      // A quién llama el almacén lo escribe postventa (Lesly, 30-09): los contactos de la
      // ficha y el de la última apertura quedan solo como sugerencias, nada se pone solo.
      setContactos(d.contactos);
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, cuentaId]);

  const renglonDe = (e: EquipoParque) => `${(e.modelo_texto ?? "Equipo").split("\n")[0]}${e.serie ? ` · serie ${e.serie}` : ""}`;

  /** Marca o desmarca una máquina: su renglón entra o sale de «Equipos» y el formato junta los datos de todas. */
  function alternarEquipo(id: string) {
    const e = parque?.find((x) => x.id === id);
    if (!e) return;
    const nuevas = elegidas.includes(id) ? elegidas.filter((x) => x !== id) : [...elegidas, id];
    setElegidas(nuevas);
    const renglon = renglonDe(e);
    setTexto((t) => {
      const lineas = t.split("\n").map((l) => l.trim()).filter(Boolean);
      const queda = nuevas.includes(id) ? (lineas.includes(renglon) ? lineas : [...lineas, renglon]) : lineas.filter((l) => l !== renglon);
      return queda.join("\n");
    });
    const formatos = nuevas
      .map((x) => parque!.find((q) => q.id === x))
      .filter((q): q is EquipoParque => Boolean(q))
      .map(formatoDesdeEquipo);
    if (formatos.length === 0) return;
    const junto: FormatoLlamada = {};
    for (const clave of Object.keys(formatos[0]) as (keyof FormatoLlamada)[]) {
      junto[clave] = [...new Set(formatos.map((f) => (f[clave] ?? "").trim()).filter(Boolean))].join(" / ");
    }
    setFormato((f) => ({ ...f, ...junto }));
  }

  useEffect(() => {
    if (cuentaFija || busca.trim().length < 3) return;
    const t = setTimeout(() => buscarEmpresaParaVisita(busca).then(setOpciones), 250);
    return () => clearTimeout(t);
  }, [busca, cuentaFija]);

  function enviar() {
    if (falta.length || !cuentaId) return void toast.error(`Para enviar falta: ${falta.join(", ")}`, { duration: 8000 });
    startTransition(async () => {
      const r = await enviarAperturaLlamada({
        cuentaId,
        pinUrgente: urgente ? pin : null,
        tecnico,
        formato: { ...formato, contacto: persona, problema: formato.problema || indicaciones },
        servicioId,
        atencionId,
        tipo,
        // La hora que se le dio al cliente es hora de Lima.
        programadaPara: new Date(`${fecha}T${hora || "10:00"}:00-05:00`).toISOString(),
        equipos: texto,
        indicaciones,
        contacto: persona,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(urgente ? "Apertura URGENTE enviada: el almacén ya la tiene" : "Apertura enviada: el almacén ya la tiene en su bandeja");
      try {
        localStorage.removeItem(claveBorrador);
      } catch {}
      setPin("");
      setAbierto(false);
      if (r.id) router.push(`/aperturas/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={cambiarAbierto}>
      <DialogTrigger
        render={
          compacto ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
              title="La orden al almacén para una videollamada o una atención"
            >
              <PhoneForwarded className="size-3.5" />
              {etiqueta}
            </button>
          ) : (
            <Button size="sm" variant={urgenteInicial ? "destructive" : "default"}>
              {urgenteInicial ? <Siren className="size-3.5" /> : <PhoneForwarded className="size-3.5" />}
              {etiqueta}
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{urgente ? "Apertura urgente al almacén" : "Derivar la llamada al almacén"}</DialogTitle>
          <DialogDescription>
            El almacén la recibe en su bandeja, le da el check cuando la toma y sube su informe. Usted lo revisa antes de que llegue al cliente.
          </DialogDescription>
        </DialogHeader>
        {ofrecido && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <span>
              Tiene una derivación que <b>no se envió</b> ({new Date(ofrecido.at).toLocaleString("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}).
            </span>
            <span className="flex gap-1.5">
              <Button size="sm" onClick={() => recuperar(ofrecido)}>
                Recuperar lo que escribí
              </Button>
              <Button size="sm" variant="ghost" onClick={descartar}>
                Descartar
              </Button>
            </span>
          </div>
        )}
        <div className="grid gap-3">
          {!cuentaFija && (
            <div className="grid gap-1">
              <Label className="text-xs">
                Cliente <span className="text-destructive">*</span>
              </Label>
              {cuenta ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                  <span className="truncate">{cuenta.nombre}</span>
                  <button type="button" className="text-xs text-primary hover:underline" onClick={() => setCuenta(null)}>
                    Cambiar
                  </button>
                </div>
              ) : (
                <>
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Razón social o RUC (3 letras o más)" autoFocus />
                  {busca.trim().length >= 3 && opciones.length > 0 && (
                    <ul className="max-h-40 overflow-auto rounded-md border border-border text-sm">
                      {opciones.map((o) => (
                        <li key={o.id}>
                          <button
                            type="button"
                            className="w-full px-2.5 py-1.5 text-left hover:bg-accent"
                            onClick={() => {
                              setCuenta({ id: o.id, nombre: o.razon_social });
                              setBusca("");
                            }}
                          >
                            {o.razon_social}
                            {o.num_doc && <span className="ml-1 text-xs text-muted-foreground">{o.num_doc}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
          <div className="grid gap-1">
            <Label className="text-xs">Qué se pide</Label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoApertura)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {TIPOS_APERTURA.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO_APERTURA[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">
                Día <span className="text-destructive">*</span>
              </Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">
                Hora que se le dio al cliente <span className="text-destructive">*</span>
              </Label>
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">
              Técnico a cargo <span className="text-destructive">*</span>
            </Label>
            <Input value={tecnico} onChange={(e) => setTecnico(e.target.value)} placeholder="Quién atiende la llamada (el almacén lo puede cambiar)" />
          </div>
          {cuentaId && (parque?.length ?? 0) > 0 && (
            <div className="grid gap-1">
              <Label className="text-xs">Máquinas del cliente: marque una o varias (llenan el formato solas)</Label>
              <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-input p-1.5">
                {parque!.map((e) => (
                  <label
                    key={e.id}
                    className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent ${elegidas.includes(e.id) ? "bg-primary/5 font-medium" : ""}`}
                  >
                    <input type="checkbox" className="mt-0.5" checked={elegidas.includes(e.id)} onChange={() => alternarEquipo(e.id)} />
                    <span className="min-w-0">
                      {(e.modelo_texto ?? "Equipo").split("\n")[0].slice(0, 90)}
                      {e.serie ? <span className="text-muted-foreground"> · serie {e.serie}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
              {elegidas.length > 1 && <p className="text-[11px] text-muted-foreground">{elegidas.length} máquinas: el técnico evalúa todas en la misma atención.</p>}
            </div>
          )}
          <div className="grid gap-1">
            <Label className="text-xs">
              Equipos <span className="text-destructive">*</span>
            </Label>
            <Textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Uno por línea, con su serie si la tiene" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Qué hay que revisar</Label>
            <Textarea
              rows={3}
              value={indicaciones}
              onChange={(e) => setIndicaciones(e.target.value)}
              placeholder="Ej.: verificar punto de gas, desagüe, conexión eléctrica y medidas del área"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">A quién llama el almacén (nombre y celular)</Label>
            <Input
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="Ej.: Juan Pérez, técnico del cliente · 987 654 321"
            />
            {contactos.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-muted-foreground">Sugerencias:</span>
                {contactos.map((c) => (
                  <button
                    key={c.texto}
                    type="button"
                    onClick={() => setPersona(c.texto)}
                    title={c.operativo ? "Contacto operativo: recibe despachos o atiende al técnico; no es contacto comercial" : undefined}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${persona === c.texto ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {c.texto}
                    {c.operativo && <span className="ml-1 rounded-full bg-muted px-1 text-[10px] text-muted-foreground">operativo</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* A la vista siempre (Gabriela y Lesly, 01-10, ALBERGUE OLLANTAYTAMBO): con un
              cliente sin máquinas en el parque venía plegado y la orden salió sin formato. */}
          <div className="rounded-lg border border-border p-2.5">
            <p className="text-xs font-semibold text-foreground">Formato de llamada (compra, entrega, garantía…)</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <CampoFormato etiqueta="Fecha de compra"><Input {...campoFormato("fecha_compra")} /></CampoFormato>
              <CampoFormato etiqueta="Fecha de entrega y N.º de guía"><Input {...campoFormato("entrega_guia")} /></CampoFormato>
              <CampoFormato etiqueta="Marca"><Input {...campoFormato("marca")} /></CampoFormato>
              <CampoFormato etiqueta="Modelo"><Input {...campoFormato("modelo")} /></CampoFormato>
              <CampoFormato etiqueta="Serie"><Input {...campoFormato("serie")} /></CampoFormato>
              <CampoFormato etiqueta="Fecha de mantenimiento"><Input {...campoFormato("fecha_mantenimiento")} /></CampoFormato>
              {/* Sin textos grises que parezcan respuestas (Lesly, 01-10): «SÍ / NO» y
                  «24 MESES» se leían como llenados y la orden salía con «—». */}
              <CampoFormato etiqueta="Protocolo de prueba">
                <select
                  value={formato.protocolo ?? ""}
                  onChange={(e) => setFormato((f) => ({ ...f, protocolo: e.target.value }))}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Elegir…</option>
                  <option value="SÍ">SÍ</option>
                  <option value="NO">NO</option>
                </select>
              </CampoFormato>
              <CampoFormato etiqueta="Garantía"><Input {...campoFormato("garantia")} placeholder="Escriba los meses (ej. 24)" /></CampoFormato>
              <CampoFormato etiqueta="Provincia"><Input {...campoFormato("provincia")} /></CampoFormato>
              <CampoFormato etiqueta="Fecha de puesta en marcha"><Input {...campoFormato("puesta_en_marcha")} /></CampoFormato>
              <CampoFormato etiqueta="Cambios correctivos" ancho><Input {...campoFormato("cambios_correctivos")} placeholder="Escriba «ninguno» si no hubo" /></CampoFormato>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">El problema es lo que escribió en «Qué hay que revisar»; la programación, el día y la hora de arriba.</p>
          </div>
          {puedeUrgente && (
            <div className={urgente ? "grid gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5" : "grid gap-2"}>
              <label className="inline-flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
                <span>
                  <b>Urgente, sin cotización ni cierre.</b>{" "}
                  <span className="text-xs text-muted-foreground">El cliente pide atención ya. Se guarda con el código de gerencia y al almacén le llega como URGENTE.</span>
                </span>
              </label>
              {urgente && <CampoCodigo valor={pin} onChange={setPin} id="pin-apertura-urgente" />}
            </div>
          )}
        </div>
        <DialogFooter className="sm:items-center">
          {falta.length > 0 ? (
            <p className="text-xs text-destructive sm:mr-auto">
              Para enviar falta: <b>{falta.join(", ")}</b>.
            </p>
          ) : vaciosFormato.length > 0 ? (
            <p className="text-xs text-amber-700 sm:mr-auto dark:text-amber-300">
              En el formato quedan vacíos: {vaciosFormato.join(", ")}. Saldrán con «—».
            </p>
          ) : null}
          <Button variant="ghost" onClick={() => cambiarAbierto(false)}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={pendiente}>
            {pendiente && <Loader2 className="size-4 animate-spin" />}
            Enviar al almacén
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampoFormato({ etiqueta, ancho, children }: { etiqueta: string; ancho?: boolean; children: React.ReactNode }) {
  return (
    <div className={ancho ? "grid gap-1 sm:col-span-2" : "grid gap-1"}>
      <Label className="text-[11px] text-muted-foreground">{etiqueta}</Label>
      {children}
    </div>
  );
}
