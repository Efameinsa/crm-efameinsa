"use client";

// Los equipos del pedido (0260). Carlos, 21-09, con el pedido de Ecolav en
// pantalla (una lavadora con serie, una secadora sin stock, y el cliente quiere
// que salga solo la lavadora): «acá tienen que aparecer los dos equipos: en
// uno la serie, porque hay stock, y el dos sin stock… la opción de qué
// máquina, la 1 o la 2. Si doy 1, significa parcial… cada máquina tiene un
// protocolo». Esta lista es eso: una fila por unidad vendida, con su serie,
// si va en este despacho, y —para el almacén— su protocolo de prueba.

import { useState, useTransition } from "react";
import Link from "@/components/enlace";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, PackageX, ScanBarcode, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { abrirOtroCircuito, agregarParteDelEquipo, equipoVaEnEsteDespacho, marcarProcedencia, marcarSinStock, quitarParteDelEquipo, registrarCodigoSinSerie, registrarSerieDelEquipo, revisarLargoDeSerie, type EquipoDelPedido } from "@/lib/acciones/postventa";
import { probarEquipoDelPedido, tecnicoYFechaDeLaPrueba } from "@/lib/acciones/almacen";
import { corregirSerie } from "@/lib/acciones/pedido-central";
import { CampoCodigo } from "@/components/crm/campo-codigo";
import type { FotoAlmacen } from "@/lib/postventa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BotonAgregarFotos, TomarOSubirVarias, VideosDeLaPrueba } from "@/components/crm/tomar-o-subir";
import { Documentos } from "@/components/crm/informe-soporte-apertura";
import { agregarArchivosDelEquipo, quitarArchivoDelEquipo } from "@/lib/acciones/almacen";
import { cn } from "@/lib/utils";
import { esTorre, seriesDeLaDescripcion } from "@/lib/torres";
import { faltaParaProbar, hojaDelSistema, type ArchivoProtocolo, type MaquinaParaProbar } from "@/lib/protocolo-completo";

/** Las tres opciones de la generación de código (0385), con el nombre que usa Lesly. */
const PROCEDENCIA: Record<string, string> = {
  importacion: "Importación",
  compra_local: "Compra local",
  fabricacion: "Fabricación",
};

/** Hoy en Lima, como «aaaa-mm-dd» (el valor del campo de fecha). */
const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

const MOTIVO_SIN_STOCK: Record<string, string> = {
  importacion: "por importar",
  compra_local: "compra local",
  fabricacion: "en fabricación",
};

export function EquiposDelPedido({
  servicioId,
  equipos: todos,
  modo,
  despachado,
  cliente,
  enlaceEquipo = "/postventa/equipos",
  candado = false,
  repuesto = false,
}: {
  servicioId: string;
  equipos: EquipoDelPedido[];
  /**
   * Postventa decide qué va; el almacén prueba y sube el protocolo; Central
   * (22-09, 0270) solo ingresa la serie que le dio el almacén al liberar el
   * pedido, sin decidir despacho ni probar nada.
   */
  modo: "postventa" | "almacen" | "central";
  despachado: boolean;
  cliente: string;
  /** null: la serie va sin enlace (Central no entra a la ficha de la máquina). */
  enlaceEquipo?: string | null;
  /** La máquina probada ya está guardada: sumarle archivos pide el código de Lesly en el informe (0450). */
  candado?: boolean;
  /** Pedido de repuestos: no lleva PDF de protocolo, modelo de placa ni hoja de chequeo. */
  repuesto?: boolean;
}) {
  // La secadora de una torre (0359) va dentro de su unidad, no es otro equipo.
  const equipos = todos.filter((e) => !e.parte_de);
  const partesDe = (id: string) => todos.filter((x) => x.parte_de === id);
  const van = equipos.filter((e) => e.en_este_despacho);
  const sinSerie = van.filter((e) => !e.serie).length;
  const sinProbar = van.filter((e) => !e.prueba_lista_at).length;
  const parcial = van.length < equipos.length;
  const resumen = [...new Set(equipos.map((e) => e.descripcion.trim()))].map((d) => ({
    titulo: d.split("\n")[0],
    n: equipos.filter((e) => e.descripcion.trim() === d).length,
    torre: esTorre(d),
  }));
  // Cada torre son dos máquinas (Rubí, 06-10: «una torre sería tener 2 ítems,
  // uno por la lavadora y otro por la secadora»).
  const torres = equipos.filter((e) => esTorre(e.descripcion)).length;

  return (
    <div className={cn("rounded-lg border p-3", despachado && sinSerie > 0 ? "border-amber-400/60 bg-amber-500/5" : "border-border")}>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <ScanBarcode className="size-4" /> Equipos de este pedido
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {equipos.length === 1 ? "1 equipo" : `${equipos.length} equipos`}
          {torres > 0 ? ` · ${equipos.length + torres} máquinas` : ""}
          {parcial ? ` · van ${van.length}` : ""}
        </span>
      </p>
      {modo === "almacen" && equipos.length > 0 && (
        <a
          href={`/pedidos/${servicioId}/protocolo`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-accent"
        >
          📄 Ver el informe de prueba y embalaje
        </a>
      )}
      <p className="mt-0.5 text-xs text-muted-foreground">
        {equipos.length === 0
          ? "El cierre no trae equipos que lleven serie (por ejemplo, un servicio de mantenimiento): no hay lista que armar."
          : despachado
            ? sinSerie > 0
              ? `El pedido ya salió y ${sinSerie === 1 ? "una máquina está" : `${sinSerie} máquinas están`} sin serie: sin ella postventa no puede atender un caso.`
              : "Todas las máquinas que salieron están registradas con su serie."
            : `Con serie = hay stock, salvo que diga «sin stock». ${
                modo === "postventa"
                  ? "Marque cuál va en este despacho; lo demás espera."
                  : modo === "central"
                    ? "Escriba la serie que le dio el almacén; sin ella, postventa no puede atender un caso de este equipo."
                    : sinProbar > 0
                      ? `Falta probar ${sinProbar === 1 ? "una máquina" : `${sinProbar} máquinas`} de las que van.`
                      : "Todo lo que va está probado."
              }`}
      </p>
      {parcial && (
        <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-800">
          <PackageX className="size-3.5" /> Despacho parcial: {equipos.length - van.length} equipo{equipos.length - van.length === 1 ? "" : "s"} no va{equipos.length - van.length === 1 ? "" : "n"} en esta salida.
        </p>
      )}
      {/* CUÁNTAS DE CADA UNO (Lesly, 25-09: «no me sale la cantidad de cuántos
          necesitan»): las unidades iguales se cuentan arriba. */}
      {resumen.some((r) => r.n > 1) && (
        <p className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
          {resumen.map((r) => (
            <span key={r.titulo} className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-foreground">
              {r.n} × {r.titulo}
              {r.torre ? ` (${r.n} lavadora${r.n === 1 ? "" : "s"} + ${r.n} secadora${r.n === 1 ? "" : "s"})` : ""}
            </span>
          ))}
        </p>
      )}
      <ol className="mt-2 space-y-2">
        {equipos.map((e) => {
          const grupo = equipos.filter((x) => x.descripcion.trim() === e.descripcion.trim());
          return (
            <Fila
              key={e.id}
              e={e}
              servicioId={servicioId}
              modo={modo}
              despachado={despachado}
              cliente={cliente}
              enlaceEquipo={enlaceEquipo}
              unidad={{ k: grupo.indexOf(e) + 1, n: grupo.length, sinCodigo: grupo.filter((x) => !x.serie).length }}
              partes={partesDe(e.id)}
              candado={candado}
              repuesto={repuesto}
            />
          );
        })}
      </ol>
      {modo === "postventa" && equipos.length > 1 && (despachado || parcial) && (
        <OtroCircuito servicioId={servicioId} equipos={despachado ? equipos : equipos.filter((e) => !e.en_este_despacho)} despachado={despachado} />
      )}
    </div>
  );
}

/**
 * OTRO CIRCUITO PARA LO QUE NO SALIÓ (Rubí, 15-10, ECOLAV; 0501): la secadora
 * que no viajó con la lavadora pasa a un pedido propio, con el pago ya hecho,
 * y recorre su prueba, apertura y despacho sin arrastrar el pedido que ya salió.
 */
function OtroCircuito({ servicioId, equipos, despachado }: { servicioId: string; equipos: EquipoDelPedido[]; despachado: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [motivo, setMotivo] = useState("");
  const [pendiente, startTransition] = useTransition();
  if (equipos.length === 0) return null;
  const alternar = (id: string) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const abrir = () =>
    startTransition(async () => {
      const r = await abrirOtroCircuito(servicioId, marcados, motivo);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Listo: el equipo tiene su propio circuito");
      router.push(`/postventa/pedidos/${r.nuevoId}`);
    });
  return (
    <div className="mt-3 rounded-md border border-dashed border-border p-2.5">
      {!abierto ? (
        <button type="button" onClick={() => setAbierto(true)} className="text-xs font-semibold text-primary hover:underline">
          {despachado ? "¿Algún equipo no salió en este despacho? Abrirle su propio circuito" : "Abrirle su propio circuito a lo que no va en este despacho"}
        </button>
      ) : (
        <div className="space-y-2 text-xs">
          <p className="font-semibold text-foreground">¿Qué equipo sale aparte?</p>
          <p className="text-muted-foreground">
            Pasa a un pedido nuevo del mismo cierre, con el pago y la aprobación ya hechos. Ahí empieza de nuevo: prueba y embalaje, dirección,
            apertura, salida y despacho. Este pedido sigue con lo que ya salió.
          </p>
          {equipos.map((e) => (
            <label key={e.id} className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={marcados.includes(e.id)} onChange={() => alternar(e.id)} />
              <span>
                {e.descripcion.split("\n")[0]}
                {e.serie ? <span className="text-muted-foreground"> · serie {e.serie}</span> : <span className="text-muted-foreground"> · sin serie</span>}
              </span>
            </label>
          ))}
          <Input value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Por qué sale aparte (ej. la secadora llegó después)" className="h-8 text-xs" />
          <div className="flex gap-2">
            <Button size="sm" onClick={abrir} disabled={pendiente || marcados.length === 0 || !motivo.trim()}>
              {pendiente && <Loader2 className="size-3 animate-spin" />} Abrir su circuito
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Fila({
  e,
  servicioId,
  modo,
  despachado,
  cliente,
  enlaceEquipo,
  unidad,
  partes,
  candado,
  repuesto,
}: {
  e: EquipoDelPedido;
  servicioId: string;
  modo: "postventa" | "almacen" | "central";
  despachado: boolean;
  cliente: string;
  enlaceEquipo: string | null;
  /** Qué unidad es de cuántas iguales, y cuántas de ellas siguen sin código. */
  unidad: { k: number; n: number; sinCodigo: number };
  /** Las otras máquinas de esta unidad, cada una con su serie (torre: la secadora; 0359). */
  partes: EquipoDelPedido[];
  candado: boolean;
  repuesto: boolean;
}) {
  const router = useRouter();
  const [abrirParte, setAbrirParte] = useState(false);
  const [parteNombre, setParteNombre] = useState("Secadora");
  const [parteSerie, setParteSerie] = useState("");
  const [pendiente, startTransition] = useTransition();
  const [serie, setSerie] = useState("");
  const [abrirSerie, setAbrirSerie] = useState(false);
  // «No lleva serie»: un código de modelo para todas las unidades iguales (0302).
  const [modoCodigo, setModoCodigo] = useState(false);
  // Corregir una serie ya puesta (0290): queda fija; cambiarla pide el código
  // de operaciones y el motivo, y queda escrito en el pedido.
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [serieNueva, setSerieNueva] = useState("");
  const [motivoSerie, setMotivoSerie] = useState("");
  const [pinSerie, setPinSerie] = useState("");
  // Aviso de largo (Lesly, 30-09): la serie de una Unimac entró con un dígito menos.
  // Sale una vez por valor; con el mismo valor, el segundo clic registra igual.
  const [avisoSerie, setAvisoSerie] = useState<{ para: string; texto: string } | null>(null);
  const [protocolo, setProtocolo] = useState("");
  const [nota, setNota] = useState("");
  // El técnico y la fecha de la prueba quedan en la hoja del informe (Lesly, 09-10).
  const fechaGuardada = e.protocolo_datos?.principal?.fecha_ejecucion ?? e.protocolo_fecha ?? null;
  const tecnicoGuardado = e.protocolo_datos?.principal?.tecnico ?? "";
  const [fechaProtocolo, setFechaProtocolo] = useState(() => fechaGuardada ?? hoyLima());
  const [tecnico, setTecnico] = useState(tecnicoGuardado);
  const [fotos, setFotos] = useState<File[]>([]);
  // El video de la prueba (Ariana, almacén 14-10): va con las fotos de la máquina, etiqueta «video».
  const [videos, setVideos] = useState<File[]>([]);
  // Varios PDF o Word por máquina (0297): el protocolo o el informe completo.
  const [docs, setDocs] = useState<File[]>([]);
  const [sumando, setSumando] = useState(false);
  const [fotosSec, setFotosSec] = useState<File[]>([]);
  const [docsSec, setDocsSec] = useState<File[]>([]);
  // La otra máquina de la torre se prueba con la unidad pero con lo suyo (Lesly, 03-10):
  // «no da la opción para agregar las fotos y el informe de la otra máquina».
  const [dePartes, setDePartes] = useState<Record<string, { protocolo: string; fotos: File[]; docs: File[] }>>({});
  const deParte = (id: string) => dePartes[id] ?? { protocolo: "", fotos: [], docs: [] };
  const cambiarParte = (id: string, cambio: Partial<{ protocolo: string; fotos: File[]; docs: File[] }>) =>
    setDePartes((x) => ({ ...x, [id]: { ...deParte(id), ...cambio } }));
  const archivosGuardados = (Array.isArray(e.protocolo_fotos) ? e.protocolo_fotos : []) as FotoAlmacen[];
  const [lineaTitulo, ...resto] = e.descripcion.split("\n");
  // LA TORRE CON UNA SOLA SERIE (GENNER FASHION, almacén 06-10: «solo me
  // permite ingresar una serie cuando en la descripción me aparecen 2»). La
  // serie de la secadora que ya trae el cierre se propone al abrir el campo.
  const torre = esTorre(e.descripcion);
  const torreIncompleta = torre && Boolean(e.serie) && !e.sin_serie && !(e.serie ?? "").includes("/") && partes.length === 0;
  const serieSugerida = torre
    ? (seriesDeLaDescripcion(e.descripcion).find((x) => x !== e.serie?.trim().toUpperCase() && !partes.some((p) => p.serie?.trim().toUpperCase() === x)) ?? "")
    : "";

  function correr(fn: () => Promise<{ error: string | null; pedidoListo?: boolean }>, exito: string) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success(r.pedidoListo ? "Con esta ya están todas: el pedido queda probado y embalado. Postventa ya lo sabe." : exito);
      router.refresh();
    });
  }

  const confirmando = (valor: string) => avisoSerie?.para === valor.trim().toUpperCase();

  function conRevision(valor: string, hacer: () => void) {
    if (confirmando(valor)) {
      setAvisoSerie(null);
      hacer();
      return;
    }
    startTransition(async () => {
      const r = await revisarLargoDeSerie(e.id, valor);
      if (r.aviso) setAvisoSerie({ para: valor.trim().toUpperCase(), texto: r.aviso });
      else hacer();
    });
  }

  const avisoDeSerie = (valor: string) =>
    confirmando(valor) ? <p className="text-[11px] font-medium text-amber-800">{avisoSerie?.texto} Si está bien así, vuelva a pulsar.</p> : null;

  async function abrirArchivo(path: string) {
    const { data } = await createClient().storage.from("adjuntos").createSignedUrl(path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    else toast.error("No se pudo abrir el archivo");
  }

  async function subir(archivos: File[], documentos: File[] = [], sufijo = ""): Promise<FotoAlmacen[] | null> {
    const storage = createClient().storage.from("adjuntos");
    const salida: FotoAlmacen[] = [];
    for (const file of [...archivos, ...documentos]) {
      const path = `pedidos/${servicioId}/almacen/protocolo-${e.orden}${sufijo}-${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(0, 60)}`;
      const tipo = file.type || tipoDeVideo(file.name) || "image/jpeg";
      // Sin tipo, el archivo viaja como octet-stream y el bucket lo rechaza: se le pone el suyo.
      const { error } = await storage.upload(path, file.type ? file : new File([file], file.name, { type: tipo }), { contentType: tipo });
      if (error) {
        toast.error(`No se pudo subir «${file.name}»: ${error.message}`);
        return null;
      }
      salida.push({ path, nombre: file.name.slice(0, 120), tipo: tipo.slice(0, 100), etiqueta: documentos.includes(file) ? "documento" : tipo.startsWith("video/") ? "video" : "protocolo" });
    }
    return salida;
  }

  const porGuardar = fotos.length + videos.length + docs.length + fotosSec.length + docsSec.length + partes.reduce((n, p) => n + deParte(p.id).fotos.length + deParte(p.id).docs.length, 0);

  // Si deja la fecha de hoy y no había otra guardada, se toma la del día en que la marque probada.
  const fechaElegida = fechaProtocolo && (fechaGuardada || fechaProtocolo !== hoyLima()) ? fechaProtocolo : "";
  const datosCambiados = tecnico.trim() !== tecnicoGuardado || (fechaElegida !== "" && fechaElegida !== fechaGuardada);

  // Lo que falta para marcarla probada y embalada (Santos, 13-10, COFACO): con lo
  // que ya está guardado más lo elegido en pantalla. El servidor vuelve a mirarlo.
  const comoArchivo = (documento: boolean) => (f: File): ArchivoProtocolo => ({ path: f.name, tipo: documento ? f.type || "application/pdf" : f.type || "image/jpeg" });
  const falta = faltaParaProbar(e as MaquinaParaProbar, partes as MaquinaParaProbar[], {
    repuesto,
    nombre: `Máquina ${e.orden}`,
    clic: {
      protocoloRef: protocolo,
      tecnico,
      principal: [...fotos.map(comoArchivo(false)), ...docs.map(comoArchivo(true))],
      secadora: [...fotosSec.map(comoArchivo(false)), ...docsSec.map(comoArchivo(true))],
      partes: Object.fromEntries(partes.map((p) => [p.id, [...deParte(p.id).fotos.map(comoArchivo(false)), ...deParte(p.id).docs.map(comoArchivo(true))]])),
    },
  });
  // Con hoja de chequeo en el sistema el informe lo genera el CRM: el Word/PDF es opcional (Lesly, 13-10).
  const tituloDocs = (maquina: MaquinaParaProbar, cual: "principal" | "secadora", de: string) =>
    hojaDelSistema(maquina, cual, repuesto)
      ? `Otro protocolo o informe de ${de} (PDF o Word, opcional: el informe lo genera el sistema con la hoja de chequeo)`
      : `Protocolo o informe de ${de} (PDF o Word, varios)`;

  /** El técnico y la fecha van a la hoja de cada máquina de la unidad (la secadora de la torre también). */
  function guardarTecnicoYFecha() {
    if (!datosCambiados) return Promise.resolve({ error: null });
    const maquinas: { id: string; maquina: "principal" | "secadora" }[] = [
      { id: e.id, maquina: "principal" },
      ...(torre && partes.length === 0 ? [{ id: e.id, maquina: "secadora" as const }] : []),
      ...partes.map((p) => ({ id: p.id, maquina: "principal" as const })),
    ];
    return tecnicoYFechaDeLaPrueba(servicioId, maquinas, { tecnico, fecha: fechaElegida });
  }

  /** Sube y guarda lo elegido de cada máquina sin marcarla como probada. */
  async function guardarFotos(): Promise<{ error: string | null }> {
    const t = await guardarTecnicoYFecha();
    if (t.error) return t;
    const propias = [...(await subir([...fotos, ...videos], docs) ?? [])];
    if (fotos.length + videos.length + docs.length > 0 && propias.length === 0) return { error: "No se subieron los archivos" };
    if (torre && partes.length === 0 && fotosSec.length + docsSec.length > 0) {
      const deSecadora = await subir(fotosSec, docsSec, "-secadora");
      if (!deSecadora) return { error: "No se subieron los archivos" };
      propias.push(...deSecadora);
    }
    if (propias.length > 0) {
      const r = await agregarArchivosDelEquipo(e.id, servicioId, propias);
      if (r.error) return r;
    }
    for (const p of partes) {
      const d = deParte(p.id);
      if (d.fotos.length + d.docs.length === 0) continue;
      const sp = await subir(d.fotos, d.docs, `-parte-${p.orden}`);
      if (!sp) return { error: "No se subieron los archivos" };
      const r = await agregarArchivosDelEquipo(p.id, servicioId, sp);
      if (r.error) return r;
    }
    setFotos([]);
    setVideos([]);
    setDocs([]);
    setFotosSec([]);
    setDocsSec([]);
    setDePartes({});
    return { error: null };
  }

  const apagado = !e.en_este_despacho;
  // El mismo momento en que sale el bloque de fotos de abajo.
  const puedeSubirFotos = modo === "almacen" && e.en_este_despacho && !e.prueba_lista_at;
  return (
    <li className={cn("rounded-md border px-2.5 py-2", apagado ? "border-dashed border-border bg-muted/40 text-muted-foreground" : "border-border bg-card")}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span className="mt-0.5 inline-flex size-5 flex-none items-center justify-center rounded-full bg-secondary text-[11px] font-bold">{e.orden}</span>
        {/* min-w: en la columna angosta (pedido de la propuesta) el botón baja en vez de pisar el nombre. */}
        <div className="min-w-[11rem] flex-1">
          <p className={cn("text-sm font-semibold leading-tight", apagado && "font-medium")}>
            {lineaTitulo}
            {unidad.n > 1 && <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">· unidad {unidad.k} de {unidad.n}</span>}
          </p>
          {resto.length > 0 && <p className="whitespace-pre-line text-[11px] leading-snug text-muted-foreground">{resto.join("\n")}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {/* LA TORRE EN DOS RENGLONES (Rubí, 06-10): esta es la lavadora; la secadora va debajo. */}
            {torre && !e.sin_serie && (
              <span className="font-semibold text-foreground">{(e.serie ?? "").includes("/") ? "Lavadora / Secadora:" : "1. Lavadora:"}</span>
            )}
            {e.serie && e.sin_stock_motivo ? (
              // 0464: ya tiene código, pero todavía no llega (Lesly, 13-10: «sí o sí me pide serie»).
              <span className="rounded-full bg-orange-500/15 px-2 py-0.5 font-mono font-semibold text-orange-800 whitespace-nowrap">
                {e.sin_serie ? "Código" : "Serie"} {e.serie} · sin stock · {MOTIVO_SIN_STOCK[e.sin_stock_motivo] ?? e.sin_stock_motivo}
              </span>
            ) : e.serie && e.sin_serie ? (
              <span className="rounded-full bg-[#1E7F4F]/10 px-2 py-0.5 font-mono font-semibold text-[#1E7F4F] whitespace-nowrap">Código {e.serie} · sin serie</span>
            ) : e.serie ? (
              e.equipo_id && enlaceEquipo ? (
                <Link href={`${enlaceEquipo}/${e.equipo_id}`} className="inline-flex items-center gap-1 rounded-full bg-[#1E7F4F]/10 px-2 py-0.5 font-mono font-semibold text-[#1E7F4F] hover:underline whitespace-nowrap">
                  Serie {e.serie} · en stock
                </Link>
              ) : (
                <span className="rounded-full bg-[#1E7F4F]/10 px-2 py-0.5 font-mono font-semibold text-[#1E7F4F] whitespace-nowrap">Serie {e.serie}</span>
              )
            ) : (
              <>
                {/* Reunión 02-10: sin stock en naranja, y con su porqué si el almacén lo marcó. */}
                <span className="rounded-full bg-orange-500/15 px-2 py-0.5 font-semibold text-orange-800 whitespace-nowrap">
                  Sin serie · sin stock{e.sin_stock_motivo ? ` · ${MOTIVO_SIN_STOCK[e.sin_stock_motivo] ?? e.sin_stock_motivo}` : " todavía"}
                </span>
              </>
            )}
            {e.prueba_lista_at ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-medium">
                <Check className="size-3" /> Probada{e.protocolo_ref ? ` · protocolo ${e.protocolo_ref}` : ""}
              </span>
            ) : e.en_este_despacho ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground whitespace-nowrap">Pendiente de prueba</span>
            ) : null}
            {puedeSubirFotos && <BotonAgregarFotos archivos={fotos} onChange={setFotos} />}
            {apagado && <span className="rounded-full border border-dashed border-border px-2 py-0.5">No va en este despacho</span>}
          </div>
          {/* LA PROCEDENCIA (0385; Lesly, 02-10: «en la generación de códigos, tres
              opciones para marcar: importación, compra local, fabricación»). Va
              para todas las unidades iguales; sin serie, es también el porqué
              del sin stock. */}
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]" role="radiogroup" aria-label="Procedencia de la máquina">
            <span className="text-muted-foreground">Procedencia:</span>
            {despachado ? (
              <span className="font-semibold text-foreground">{e.procedencia ? PROCEDENCIA[e.procedencia] ?? e.procedencia : "sin marcar"}</span>
            ) : (
              Object.entries(PROCEDENCIA).map(([valor, etiqueta]) => {
                const marcada = e.procedencia === valor;
                return (
                  <button
                    key={valor}
                    type="button"
                    role="radio"
                    aria-checked={marcada}
                    disabled={pendiente}
                    title={marcada ? "Tocar de nuevo para quitarla" : `Marcar ${etiqueta.toLowerCase()}${unidad.n > 1 ? ` para las ${unidad.n} unidades iguales` : ""}`}
                    onClick={() =>
                      correr(() => marcarProcedencia(e.id, servicioId, marcada ? null : valor), marcada ? "Procedencia quitada" : `Marcado: ${etiqueta.toLowerCase()}`)
                    }
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium transition-colors",
                      marcada ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-accent",
                    )}
                  >
                    {marcada && <Check className="size-3" />}
                    {etiqueta}
                  </button>
                );
              })
            )}
            {/* SIN STOCK AUNQUE YA TENGA CÓDIGO (0464): el código se da apenas Central
                lo pide; si la pieza aún no llega, se marca aquí y se desmarca al llegar. */}
            {e.serie && !despachado && modo !== "central" && (
              <button
                type="button"
                disabled={pendiente}
                onClick={() =>
                  correr(
                    () => marcarSinStock(e.id, e.sin_stock_motivo ? null : (e.procedencia ?? "importacion")),
                    e.sin_stock_motivo ? "Marcado: ya llegó, hay stock" : "Marcado: sin stock, todavía no llega",
                  )
                }
                className={cn(
                  "ml-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium transition-colors",
                  e.sin_stock_motivo
                    ? "border-[#1E7F4F]/40 text-[#1E7F4F] hover:bg-[#1E7F4F]/5"
                    : "border-orange-500/50 text-orange-800 hover:bg-orange-500/10",
                )}
                title={e.sin_stock_motivo ? "La pieza ya está en el almacén" : "Tiene código, pero todavía no llega al almacén"}
              >
                {e.sin_stock_motivo ? "Ya llegó · hay stock" : "Sin stock"}
              </button>
            )}
          </div>
          {/* LA OTRA MÁQUINA DE LA TORRE (Lesly, 30-09; 0359): su serie y su ficha en el parque. */}
          {partes.map((p, i) => (
            <div key={p.id} className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-semibold text-foreground">{torre ? `${i + 2}. ` : ""}{p.parte_nombre ?? "Otra máquina"}:</span>
              {p.equipo_id && enlaceEquipo ? (
                <Link href={`${enlaceEquipo}/${p.equipo_id}`} className="rounded-full bg-[#1E7F4F]/10 px-2 py-0.5 font-mono font-semibold text-[#1E7F4F] hover:underline whitespace-nowrap">
                  Serie {p.serie}
                </Link>
              ) : (
                <span className="rounded-full bg-[#1E7F4F]/10 px-2 py-0.5 font-mono font-semibold text-[#1E7F4F] whitespace-nowrap">Serie {p.serie}</span>
              )}
              {!despachado && (
                <button
                  type="button"
                  disabled={pendiente}
                  className="text-muted-foreground hover:text-destructive hover:underline"
                  onClick={() => {
                    if (confirm(`¿Quitar la serie ${p.serie} (${p.parte_nombre ?? "otra máquina"}) de esta unidad?`)) {
                      correr(() => quitarParteDelEquipo(p.id, servicioId), "Serie quitada");
                    }
                  }}
                >
                  Quitar
                </button>
              )}
              {puedeSubirFotos && <BotonAgregarFotos archivos={deParte(p.id).fotos} onChange={(f) => cambiarParte(p.id, { fotos: f })} />}
              {e.prueba_lista_at && p.protocolo_ref && <span className="text-muted-foreground">· protocolo {p.protocolo_ref}</span>}
              {modo !== "central" && <ArchivosDeParte p={p} servicioId={servicioId} probada={Boolean(e.prueba_lista_at)} candado={candado} />}
            </div>
          ))}
          {/* La secadora de la torre sin serie todavía: su renglón igual se ve (Rubí, 06-10). */}
          {torre && !e.sin_serie && partes.length === 0 && !(e.serie ?? "").includes("/") && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-semibold text-foreground">2. Secadora:</span>
              <span className="rounded-full bg-orange-500/15 px-2 py-0.5 font-semibold text-orange-800 whitespace-nowrap">
                {e.serie ? "falta su serie" : "Sin serie · sin stock todavía"}
              </span>
              {serieSugerida && <span className="text-muted-foreground">· la descripción dice {serieSugerida}</span>}
              {puedeSubirFotos && <BotonAgregarFotos archivos={fotosSec} onChange={setFotosSec} />}
            </div>
          )}
          {e.serie && !e.sin_serie && !despachado && partes.length < 3 && (
            abrirParte ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Input value={parteNombre} onChange={(x) => setParteNombre(x.target.value)} placeholder="Qué máquina (ej. Secadora)" className="h-8 w-32 text-sm" />
                <Input value={parteSerie} onChange={(x) => setParteSerie(x.target.value)} placeholder="Serie como se lee en la placa" className="h-8 w-56 font-mono text-sm uppercase" autoFocus />
                <Button
                  size="sm"
                  className="h-8"
                  disabled={pendiente || !parteNombre.trim() || !parteSerie.trim()}
                  onClick={() =>
                    conRevision(parteSerie, () =>
                      correr(async () => {
                        const r = await agregarParteDelEquipo(e.id, servicioId, parteNombre, parteSerie);
                        if (!r.error) {
                          setAbrirParte(false);
                          setParteSerie("");
                        }
                        return r;
                      }, `${parteNombre.trim() || "Máquina"} registrada con su serie`),
                    )
                  }
                >
                  {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : null} {confirmando(parteSerie) ? "Sí, registrar así" : "Registrar"}
                </Button>
                <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={() => setAbrirParte(false)}>Cancelar</button>
                <div className="basis-full">{avisoDeSerie(parteSerie)}</div>
              </div>
            ) : (
              <button
                type="button"
                className="mt-1 text-[11px] font-medium text-primary hover:underline"
                onClick={() => {
                  setParteSerie((x) => x || serieSugerida);
                  setAbrirParte(true);
                }}
              >
                {torreIncompleta ? "+ Serie de la secadora (la torre lleva dos placas)" : "+ Otra serie en esta unidad (torre: la secadora)"}
              </button>
            )
          )}
          {/* Ya salió: la segunda serie no se agrega desde aquí, pero se dice por qué
              (antes el botón no aparecía y parecía una falla; GENNER FASHION 06-10). */}
          {torreIncompleta && despachado && (
            <p className="mt-1 text-[11px] text-amber-800">
              Esta torre tiene una sola serie y el pedido ya figura despachado: la de la secadora
              {serieSugerida ? ` (${serieSugerida}, según la descripción)` : ""} ya no se agrega desde el pedido. Postventa la registra al cerrar el
              pedido, o la corrige operaciones con su código.
            </p>
          )}
        </div>
        {modo === "postventa" && !despachado && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => equipoVaEnEsteDespacho(e.id, servicioId, !e.en_este_despacho), e.en_este_despacho ? "Queda fuera de este despacho" : "Va en este despacho")}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] font-semibold",
              e.en_este_despacho ? "border-border hover:bg-accent" : "border-primary/40 text-primary hover:bg-primary/5",
            )}
          >
            {pendiente ? <Loader2 className="size-3 animate-spin" /> : e.en_este_despacho ? "No va en este despacho" : "Sí va en este despacho"}
          </button>
        )}
      </div>

      {e.serie && !e.sin_serie && !despachado && (
        <div className="mt-1.5">
          {corrigiendo ? (
            <div className="space-y-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
              <p className="text-[11px] text-amber-900">La serie queda fija. Para cambiarla hace falta el código de operaciones o gerencia, y queda escrito por qué.</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <Input value={serieNueva} onChange={(x) => setSerieNueva(x.target.value)} placeholder="Serie correcta" className="h-8 font-mono text-sm uppercase" />
                <Input value={motivoSerie} onChange={(x) => setMotivoSerie(x.target.value)} placeholder="Por qué (ej.: se leyó mal la placa)" className="h-8 text-sm" />
              </div>
              {avisoDeSerie(serieNueva)}
              <CampoCodigo valor={pinSerie} onChange={setPinSerie} tono="amber" id={`pin-serie-${e.id}`} />
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="h-8"
                  disabled={pendiente || !serieNueva.trim() || motivoSerie.trim().length < 5 || pinSerie.replace(/\D/g, "").length < 4}
                  onClick={() => conRevision(serieNueva, () => correr(() => corregirSerie(e.id, servicioId, serieNueva, pinSerie, motivoSerie), "Serie corregida; quedó escrito en el pedido"))}
                >
                  {confirmando(serieNueva) ? "Sí, corregir así" : "Corregir"}
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setCorrigiendo(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={() => setCorrigiendo(true)}>
              ¿Serie equivocada? Corregir con código
            </button>
          )}
        </div>
      )}

      {/* La serie: se lee en la placa (postventa o almacén). */}
      {!e.serie && (
        <div className="mt-1.5">
          {modoCodigo ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Input value={serie} onChange={(x) => setSerie(x.target.value)} placeholder="Código del modelo" className="h-8 font-mono text-sm uppercase" autoFocus />
                <Button
                  size="sm"
                  className="h-8"
                  disabled={pendiente || !serie.trim()}
                  onClick={() => correr(() => registrarCodigoSinSerie(e.id, servicioId, serie), `Código puesto a ${unidad.sinCodigo === 1 ? "la unidad" : `las ${unidad.sinCodigo} unidades`}`)}
                >
                  {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : null} Poner a {unidad.sinCodigo === 1 ? "esta unidad" : `las ${unidad.sinCodigo} unidades`}
                </Button>
                <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={() => setModoCodigo(false)}>Cancelar</button>
              </div>
              <p className="text-[11px] text-muted-foreground">Un solo código para todas las unidades de este artículo que no tienen serie. No entran al registro de máquinas.</p>
            </div>
          ) : abrirSerie ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Input value={serie} onChange={(x) => setSerie(x.target.value)} placeholder="Serie como se lee en la placa" className="h-8 font-mono text-sm uppercase" autoFocus />
                <Button
                  size="sm"
                  className="h-8"
                  disabled={pendiente || !serie.trim()}
                  onClick={() => conRevision(serie, () => correr(() => registrarSerieDelEquipo(e.id, servicioId, serie), "Serie registrada: la máquina ya está en el registro de máquinas"))}
                >
                  {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : null} {confirmando(serie) ? "Sí, registrar así" : "Registrar"}
                </Button>
                <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={() => setAbrirSerie(false)}>Cancelar</button>
              </div>
              {avisoDeSerie(serie)}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button type="button" className="text-[11px] font-medium text-primary hover:underline" onClick={() => setAbrirSerie(true)}>
                + Registrar la serie (llegó el stock)
              </button>
              <button type="button" className="text-[11px] font-medium text-primary hover:underline" onClick={() => setModoCodigo(true)}>
                No lleva serie: un código para {unidad.sinCodigo === 1 ? "esta unidad" : `las ${unidad.sinCodigo} unidades`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* El almacén prueba esta máquina y sube SU protocolo. */}
      {modo === "almacen" && e.en_este_despacho && !e.prueba_lista_at && (
        <div className="mt-2 space-y-1.5 rounded-md bg-muted/40 p-2">
          <div className="grid gap-1.5 sm:grid-cols-[11rem_1fr]">
            <Input value={protocolo} onChange={(x) => setProtocolo(x.target.value)} placeholder={`N.º de protocolo (opcional)`} className="h-8 text-sm" />
            <Input value={nota} onChange={(x) => setNota(x.target.value)} placeholder="Nota: probada con carga, embalada en pallet…" className="h-8 text-sm" />
          </div>
          {/* La fecha en que de verdad se hizo (Ariana, 07-10): el protocolo pudo hacerse antes de registrarlo en el CRM.
              Y quién la hizo (Lesly, 09-10): los dos salen en el informe («Fecha de Ejecución», «Técnico a Cargo»). */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
            <label className="flex flex-wrap items-center gap-1.5">
              Fecha en que se hizo la prueba:
              <Input type="date" value={fechaProtocolo} max={hoyLima()} onChange={(x) => setFechaProtocolo(x.target.value)} className="h-8 w-40 text-sm" />
            </label>
            <label className="flex flex-wrap items-center gap-1.5">
              Técnico que hizo la prueba:
              <Input value={tecnico} onChange={(x) => setTecnico(x.target.value)} placeholder="Nombre del técnico" maxLength={120} className="h-8 w-56 text-sm" />
            </label>
            <span>(salen en el informe; si deja la fecha de hoy, queda la de hoy)</span>
          </div>
          <TomarOSubirVarias titulo={partes.length ? "Fotos de la primera máquina" : "Fotos de esta máquina"} archivos={fotos} onChange={setFotos} maximo={100} />
          <VideosDeLaPrueba titulo="Video de la prueba (opcional)" archivos={videos} onChange={setVideos} />
          <Documentos archivos={docs} onChange={setDocs} titulo={tituloDocs(e as MaquinaParaProbar, "principal", partes.length ? "la primera máquina" : "esta máquina")} />
          {/* La torre cuya secadora aún no tiene su renglón (sin stock): sus fotos y su informe igual se suben (Ariana, 07-10). */}
          {torre && partes.length === 0 && (
            <div className="space-y-1.5 border-t border-border pt-1.5">
              <p className="text-[11px] font-semibold text-foreground">Secadora de la torre</p>
              <TomarOSubirVarias titulo="Fotos de la secadora" archivos={fotosSec} onChange={setFotosSec} maximo={100} />
              <Documentos archivos={docsSec} onChange={setDocsSec} titulo={tituloDocs(e as MaquinaParaProbar, "secadora", "la secadora")} />
            </div>
          )}
          {partes.map((p) => (
            <div key={p.id} className="space-y-1.5 border-t border-border pt-1.5">
              <p className="text-[11px] font-semibold text-foreground">
                {p.parte_nombre ?? "Otra máquina"} · serie {p.serie}
              </p>
              <Input
                value={deParte(p.id).protocolo}
                onChange={(x) => cambiarParte(p.id, { protocolo: x.target.value })}
                placeholder={`N.º de protocolo de la ${(p.parte_nombre ?? "otra máquina").toLowerCase()} (opcional)`}
                className="h-8 text-sm"
              />
              <TomarOSubirVarias titulo={`Fotos de la ${(p.parte_nombre ?? "otra máquina").toLowerCase()}`} archivos={deParte(p.id).fotos} onChange={(f) => cambiarParte(p.id, { fotos: f })} maximo={100} />
              <Documentos archivos={deParte(p.id).docs} onChange={(d) => cambiarParte(p.id, { docs: d })} titulo={tituloDocs(p as MaquinaParaProbar, "principal", `la ${(p.parte_nombre ?? "otra máquina").toLowerCase()}`)} />
            </div>
          ))}
          {/* GUARDAR LAS FOTOS SIN MARCAR LA MÁQUINA COMO PROBADA (Ariana, 07-10: «ni bien subo las
              fotos debería generarse el informe»). Antes nada se guardaba hasta «Probada y embalada»,
              así que el informe no tenía nada que mostrar. Con esto las fotos quedan en el informe
              de inmediato y la máquina se marca probada cuando el almacén lo decide. */}
          <Button
            size="sm"
            variant="outline"
            className="mr-1.5 h-8"
            disabled={pendiente || (porGuardar === 0 && !datosCambiados)}
            onClick={() => correr(guardarFotos, porGuardar === 0 ? "Técnico y fecha guardados: ya salen en el informe" : "Fotos guardadas: ya están en el informe de prueba y embalaje")}
          >
            {porGuardar === 0 && datosCambiados ? "Guardar técnico y fecha" : "Guardar fotos"}
          </Button>
          {/* EL BORRADOR DEL INFORME ANTES DE CERRAR (Ariana, 07-10: «una opción para visualizar el
              informe como borrador antes de guardar los cambios… verificar que todo sea correcto antes
              de finalizar el registro»). Guarda lo elegido sin marcar la máquina y abre el informe. */}
          <Button
            size="sm"
            variant="outline"
            className="mr-1.5 h-8"
            disabled={pendiente}
            onClick={() => {
              // La pestaña se abre con el clic (si se abre después de subir, el navegador la bloquea).
              const ventana = window.open("about:blank", "_blank");
              const informe = `/pedidos/${servicioId}/protocolo`;
              if (porGuardar === 0 && !datosCambiados) {
                if (ventana) ventana.location.href = informe;
                else router.push(informe);
                return;
              }
              startTransition(async () => {
                const r = await guardarFotos();
                if (r.error) {
                  ventana?.close();
                  toast.error(r.error, { duration: 9000 });
                  return;
                }
                if (ventana) ventana.location.href = informe;
                toast.success("Guardado. El borrador del informe se abrió en otra pestaña; la máquina sigue sin marcar como probada.");
                router.refresh();
              });
            }}
          >
            📄 Ver el borrador del informe
          </Button>
          {falta.length > 0 && (
            <div className="rounded-md border border-amber-400/60 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-900">
              <p className="font-semibold">Para marcarla probada y embalada falta:</p>
              <ul className="ml-4 list-disc">
                {falta.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <p className="mt-0.5">
                La ficha (modelo de la placa) y la hoja de chequeo se llenan en{" "}
                <a href={`/pedidos/${servicioId}/protocolo`} target="_blank" rel="noreferrer" className="font-semibold underline">
                  el informe de prueba y embalaje
                </a>
                ; las fotos y el PDF, aquí arriba. Al volver, recargue la página.
              </p>
            </div>
          )}
          <Button
            size="sm"
            className="h-8"
            disabled={pendiente || falta.length > 0}
            title={falta.length > 0 ? `Falta: ${falta.join(" · ")}` : undefined}
            onClick={() =>
              correr(async () => {
                const t = await guardarTecnicoYFecha();
                if (t.error) return t;
                const subidas = await subir([...fotos, ...videos], docs);
                if (!subidas) return { error: "No se subieron los archivos" };
                if (torre && partes.length === 0 && fotosSec.length + docsSec.length > 0) {
                  const deSecadora = await subir(fotosSec, docsSec, "-secadora");
                  if (!deSecadora) return { error: "No se subieron los archivos" };
                  subidas.push(...deSecadora);
                }
                const deLasPartes: { id: string; protocoloRef: string; fotos: FotoAlmacen[] }[] = [];
                for (const p of partes) {
                  const d = deParte(p.id);
                  const s = await subir(d.fotos, d.docs, `-parte-${p.orden}`);
                  if (!s) return { error: "No se subieron los archivos" };
                  deLasPartes.push({ id: p.id, protocoloRef: d.protocolo, fotos: s });
                }
                return probarEquipoDelPedido(e.id, servicioId, { protocoloRef: protocolo, nota, fotos: subidas, cliente, equipo: lineaTitulo, partes: deLasPartes, fecha: fechaProtocolo && fechaProtocolo !== hoyLima() ? fechaProtocolo : null });
              }, partes.length ? `Máquina ${e.orden} probada y embalada, con la ${(partes[0].parte_nombre ?? "otra máquina").toLowerCase()}` : `Máquina ${e.orden} probada y embalada`)
            }
          >
            {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Probada y embalada
          </Button>
        </div>
      )}

      {/* Lo que ya se subió de esta máquina, y sumar más después (0297). */}
      {modo !== "central" && (archivosGuardados.length > 0 || e.prueba_lista_at) && (
        <div className="mt-2 space-y-1.5">
          {archivosGuardados.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {archivosGuardados.map((a, i) => (
                <li key={i} className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => abrirArchivo(a.path)}
                    className="inline-flex max-w-56 items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-foreground hover:bg-accent"
                    title={a.nombre}
                  >
                    {a.etiqueta === "documento" || /pdf|word|document/i.test(a.tipo ?? "") ? "📄" : (a.tipo ?? "").startsWith("video/") ? "🎬" : "🖼️"} <span className="truncate">{a.nombre}</span>
                  </button>
                  {!(e.prueba_lista_at && candado) && (
                    <QuitarArchivo itemId={e.id} servicioId={servicioId} archivo={a} />
                  )}
                </li>
              ))}
            </ul>
          )}
          {e.prueba_lista_at && candado ? (
            <ConCodigoEnElInforme servicioId={servicioId} />
          ) : e.prueba_lista_at &&
            (sumando ? (
              <div className="space-y-1.5 rounded-md bg-muted/40 p-2">
                <TomarOSubirVarias titulo="Más fotos de esta máquina" archivos={fotos} onChange={setFotos} maximo={100} />
                <VideosDeLaPrueba titulo="Video de la prueba" archivos={videos} onChange={setVideos} />
                <Documentos archivos={docs} onChange={setDocs} titulo="Más documentos (PDF o Word)" />
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={pendiente || fotos.length + videos.length + docs.length === 0}
                    onClick={() =>
                      correr(async () => {
                        const subidas = await subir([...fotos, ...videos], docs);
                        if (!subidas) return { error: "No se subieron los archivos" };
                        const r = await agregarArchivosDelEquipo(e.id, servicioId, subidas);
                        if (!r.error) {
                          setFotos([]);
                          setVideos([]);
                          setDocs([]);
                          setSumando(false);
                        }
                        return r;
                      }, "Archivos agregados a la máquina")
                    }
                  >
                    {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : null} Guardar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setSumando(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" className="text-[11px] font-medium text-primary hover:underline" onClick={() => setSumando(true)}>
                + Agregar fotos, video o documentos
              </button>
            ))}
        </div>
      )}
    </li>
  );
}

/** Lo que se subió de la otra máquina de la torre, y sumar más después (0389, Lesly 03-10). */
/** La máquina probada ya está guardada (0450; Ariana, 13-10): sumar o corregir se abre con el código de Lesly desde el informe. */
/** Windows a veces no le pone tipo al .mov o .mp4; el bucket lo exige (0337). */
function tipoDeVideo(nombre: string): string | null {
  const ext = nombre.split(".").pop()?.toLowerCase();
  return ext === "mp4" ? "video/mp4" : ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : ext === "3gp" ? "video/3gpp" : null;
}

/**
 * La ✕ al lado de cada archivo guardado (0504; Ariana, 15-10: subió dos
 * imágenes que no eran del OPEN 060-2026). Pregunta antes de quitar.
 */
function QuitarArchivo({ itemId, servicioId, archivo }: { itemId: string; servicioId: string; archivo: FotoAlmacen }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      title={`Quitar «${archivo.nombre}»`}
      aria-label={`Quitar ${archivo.nombre}`}
      className="ml-0.5 inline-flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
      onClick={() => {
        if (!window.confirm(`¿Quitar «${archivo.nombre}» de esta máquina? Deja de salir en el informe de prueba y embalaje.`)) return;
        startTransition(async () => {
          const r = await quitarArchivoDelEquipo(itemId, servicioId, archivo.path);
          if (r.error) return void toast.error(r.error, { duration: 9000 });
          toast.success("Archivo quitado");
          router.refresh();
        });
      }}
    >
      {pendiente ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
    </button>
  );
}

function ConCodigoEnElInforme({ servicioId }: { servicioId: string }) {
  return (
    <p className="text-[11px] text-muted-foreground">
      🔒 Guardado. Para agregar o corregir,{" "}
      <Link href={`/pedidos/${servicioId}/protocolo`} className="font-medium text-primary hover:underline">
        ábralo con el código de Lesly en el informe
      </Link>
      .
    </p>
  );
}

function ArchivosDeParte({ p, servicioId, probada, candado }: { p: EquipoDelPedido; servicioId: string; probada: boolean; candado: boolean }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [fotos, setFotos] = useState<File[]>([]);
  const [docs, setDocs] = useState<File[]>([]);
  const guardados = (Array.isArray(p.protocolo_fotos) ? p.protocolo_fotos : []) as FotoAlmacen[];
  const nombre = (p.parte_nombre ?? "otra máquina").toLowerCase();

  async function abrir(path: string) {
    const { data } = await createClient().storage.from("adjuntos").createSignedUrl(path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
    else toast.error("No se pudo abrir el archivo");
  }

  function guardar() {
    startTransition(async () => {
      const storage = createClient().storage.from("adjuntos");
      const subidas: FotoAlmacen[] = [];
      for (const file of [...fotos, ...docs]) {
        const path = `pedidos/${servicioId}/almacen/protocolo-parte-${p.orden}-${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(0, 60)}`;
        const { error } = await storage.upload(path, file, { contentType: file.type || "image/jpeg" });
        if (error) return void toast.error(`No se pudo subir «${file.name}»: ${error.message}`);
        subidas.push({ path, nombre: file.name.slice(0, 120), tipo: file.type.slice(0, 100), etiqueta: docs.includes(file) ? "documento" : "protocolo" });
      }
      const r = await agregarArchivosDelEquipo(p.id, servicioId, subidas);
      if (r.error) return void toast.error(r.error);
      toast.success(`Archivos agregados a la ${nombre}`);
      setFotos([]);
      setDocs([]);
      setAbierto(false);
      router.refresh();
    });
  }

  if (!probada && guardados.length === 0) return null;
  return (
    <div className="basis-full space-y-1.5 pl-2">
      {guardados.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {guardados.map((a, i) => (
            <li key={i} className="inline-flex items-center">
              <button
                type="button"
                onClick={() => abrir(a.path)}
                className="inline-flex max-w-56 items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] text-foreground hover:bg-accent"
                title={a.nombre}
              >
                {a.etiqueta === "documento" || /pdf|word|document/i.test(a.tipo ?? "") ? "📄" : (a.tipo ?? "").startsWith("video/") ? "🎬" : "🖼️"} <span className="truncate">{a.nombre}</span>
              </button>
              {!(probada && candado) && <QuitarArchivo itemId={p.id} servicioId={servicioId} archivo={a} />}
            </li>
          ))}
        </ul>
      )}
      {probada && candado ? (
        <ConCodigoEnElInforme servicioId={servicioId} />
      ) : probada &&
        (abierto ? (
          <div className="space-y-1.5 rounded-md bg-muted/40 p-2">
            <TomarOSubirVarias titulo={`Fotos de la ${nombre}`} archivos={fotos} onChange={setFotos} maximo={100} />
            <Documentos archivos={docs} onChange={setDocs} titulo={`Protocolo o informe de la ${nombre} (PDF o Word)`} />
            <div className="flex gap-1.5">
              <Button size="sm" className="h-8" disabled={pendiente || fotos.length + docs.length === 0} onClick={guardar}>
                {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : null} Guardar
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" className="text-[11px] font-medium text-primary hover:underline" onClick={() => setAbierto(true)}>
            + Fotos o informe de la {nombre}
          </button>
        ))}
    </div>
  );
}
