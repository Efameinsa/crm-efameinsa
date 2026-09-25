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

  // Al abrir (o al elegir el cliente) se traen sus máquinas para el formato.
  useEffect(() => {
    if (!abierto || !cuentaId) return;
    let vigente = true;
    datosParaFormatoDeLlamada(cuentaId).then((d) => {
      if (!vigente) return;
      setParque(d.equipos);
      setFormato((f) => ({ ...f, contacto: f.contacto || d.contacto || "" }));
      if (!persona && d.contacto) setPersona(d.contacto);
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
    if (!cuentaId) return void toast.error("Elija el cliente");
    if (urgente && pin.replace(/\D/g, "").length < 4) return void toast.error("La apertura urgente pide el código de gerencia");
    startTransition(async () => {
      const r = await enviarAperturaLlamada({
        cuentaId,
        pinUrgente: urgente ? pin : null,
        tecnico,
        formato: { ...formato, contacto: formato.contacto || persona, problema: formato.problema || indicaciones },
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
      setPin("");
      setAbierto(false);
      if (r.id) router.push(`/aperturas/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
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
            <Label className="text-xs">Técnico a cargo</Label>
            <Input value={tecnico} onChange={(e) => setTecnico(e.target.value)} placeholder="Lo pone postventa: el almacén lo ve y no lo cambia" />
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
            <Label className="text-xs">Con quién se habla (nombre y celular)</Label>
            <Input value={persona} onChange={(e) => setPersona(e.target.value)} />
          </div>
          <details className="rounded-lg border border-border p-2.5" open={elegidas.length > 0}>
            <summary className="cursor-pointer text-xs font-semibold text-foreground">Formato de llamada (compra, entrega, garantía…)</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <CampoFormato etiqueta="Fecha de compra"><Input {...campoFormato("fecha_compra")} /></CampoFormato>
              <CampoFormato etiqueta="Fecha de entrega y N.º de guía"><Input {...campoFormato("entrega_guia")} /></CampoFormato>
              <CampoFormato etiqueta="Marca"><Input {...campoFormato("marca")} /></CampoFormato>
              <CampoFormato etiqueta="Modelo"><Input {...campoFormato("modelo")} /></CampoFormato>
              <CampoFormato etiqueta="Serie"><Input {...campoFormato("serie")} /></CampoFormato>
              <CampoFormato etiqueta="Fecha de mantenimiento"><Input {...campoFormato("fecha_mantenimiento")} /></CampoFormato>
              <CampoFormato etiqueta="Protocolo de prueba"><Input {...campoFormato("protocolo")} placeholder="SÍ / NO" /></CampoFormato>
              <CampoFormato etiqueta="Garantía"><Input {...campoFormato("garantia")} placeholder="24 MESES" /></CampoFormato>
              <CampoFormato etiqueta="Provincia"><Input {...campoFormato("provincia")} /></CampoFormato>
              <CampoFormato etiqueta="Fecha de puesta en marcha"><Input {...campoFormato("puesta_en_marcha")} /></CampoFormato>
              <CampoFormato etiqueta="Cambios correctivos" ancho><Input {...campoFormato("cambios_correctivos")} placeholder="NINGUNO" /></CampoFormato>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">El problema es lo que escribió en «Qué hay que revisar»; la programación, el día y la hora de arriba.</p>
          </details>
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
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={pendiente || !cuentaId || !texto.trim() || !fecha || !hora || (urgente && pin.replace(/\D/g, "").length < 4)}>
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
