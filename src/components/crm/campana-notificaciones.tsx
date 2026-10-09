"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Bell, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  marcarLeidasDelDestino,
  marcarNotificacionLeida,
  marcarTodasLeidas,
} from "@/lib/acciones/notificaciones";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fechaHoraLima, fechaLima } from "@/lib/fechas";
import {
  alertaSilenciada,
  prepararAlerta,
  silenciarAlerta,
  sonarAlerta,
  sonarCampanada,
  sonarPrueba,
  sonarWhatsapp,
} from "@/lib/sonido-alerta";
import { tituloDePestanaWhatsapp } from "@/lib/aviso-whatsapp";
import { anunciarPendientesWhatsapp } from "@/lib/pendientes-whatsapp";
import type { RolUsuario } from "@/types/database";

interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  url: string | null;
  leida_at: string | null;
  created_at: string;
}

/**
 * Cómo se anuncia cada clase de aviso.
 *
 * El encabezado es lo primero que se lee, así que dice QUÉ PASÓ en dos
 * palabras; el detalle va debajo. «Nuevo ingreso» es el texto que pidió Central
 * el 24-08 para los prospectos que entran.
 */
const ESTILO_AVISO: Record<
  string,
  {
    encabezado: string;
    accion: string;
    duracion: number;
    tono: "success" | "info" | "warning" | "error";
  }
> = {
  lead_registrado: {
    encabezado: "Nuevo ingreso",
    accion: "Ver bandeja",
    duracion: 12000,
    tono: "info",
  },
  lead_asignado: {
    encabezado: "Le derivaron un prospecto",
    accion: "Atenderlo",
    duracion: 12000,
    tono: "info",
  },
  cotizacion_aprobada: {
    encabezado: "Gerencia aprobó su cotización",
    accion: "Enviarla",
    duracion: 14000,
    tono: "success",
  },
  cotizacion_rechazada: {
    encabezado: "Gerencia devolvió su cotización",
    accion: "Corregirla",
    duracion: 14000,
    tono: "warning",
  },
  // Gerencia observa sin rechazar y la comercial responde (0415).
  cotizacion_observada: {
    encabezado: "Gerencia observó su cotización",
    accion: "Responder",
    duracion: 14000,
    tono: "warning",
  },
  cotizacion_respondida: {
    encabezado: "La comercial respondió su observación",
    accion: "Revisarla",
    duracion: 14000,
    tono: "info",
  },
  // Postventa pide revisar un borrador (0392) y el acuse de que gerencia lo vio.
  cotizacion_revision: {
    encabezado: "Postventa pide revisar una cotización",
    accion: "Revisarla",
    duracion: 12000,
    tono: "warning",
  },
  cotizacion_vista: {
    encabezado: "Gerencia vio su cotización",
    accion: "Abrirla",
    duracion: 14000,
    tono: "success",
  },
  cotizacion_pendiente: {
    encabezado: "Una cotización espera su aprobación",
    accion: "Revisarla",
    duracion: 12000,
    tono: "warning",
  },
  // La única que NO se va sola (duración infinita): existe porque un cliente
  // ya reclamó que lo dejaron esperando (25-08, Mi Casita Facilita). Si esta
  // ventanita desapareciera a los 12 segundos como las demás, un comercial
  // que fue al baño vuelve y no se entera. Se queda hasta que la toque.
  urgencia: {
    encabezado: "🚨 Urgente — un cliente está esperando",
    accion: "Atenderlo ya",
    duracion: Infinity,
    tono: "error",
  },
  // Central le pide a Finanzas apurar un pedido (0298): el cliente necesita la
  // factura o quiere despachar. Misma regla que la urgencia al comercial: se
  // queda hasta que la toquen.
  urgencia_finanzas: {
    encabezado: "🚨 Urgente — Central pide apurar este pedido",
    accion: "Ver el pedido",
    duracion: Infinity,
    tono: "error",
  },
  // Central apura al almacén por las series de un pedido (0358, 30-09):
  // «alarma, notificación y todo». Igual que la de Finanzas.
  urgencia_almacen: {
    encabezado: "🚨 Urgente — Central pide las series",
    accion: "Ver el pedido",
    duracion: Infinity,
    tono: "error",
  },
  // Central anuló un cierre (0237) y alguien viene a la planta (0238).
  cierre_anulado: {
    encabezado: "Central anuló un cierre suyo",
    accion: "Ver el motivo",
    duracion: Infinity,
    tono: "warning",
  },
  visita_planta: {
    encabezado: "Visita a la planta",
    accion: "Imprimir para vigilancia",
    duracion: 14000,
    tono: "info",
  },
  // El cliente respondió a una ficha por WhatsApp (0250): no se va sola, como la urgencia.
  whatsapp: {
    encabezado: "💬 WhatsApp — el cliente respondió",
    accion: "Abrir el chat",
    duracion: Infinity,
    tono: "success",
  },
  // Clientes esperando su respuesta en WhatsApp (0394, Central con el
  // ingeniero, 05-10). Como la urgencia: se queda hasta que la toquen.
  whatsapp_sin_respuesta: {
    encabezado: "⏰ Clientes esperan su respuesta en WhatsApp",
    accion: "Responder",
    duracion: Infinity,
    tono: "error",
  },
  // Saldo de Google Ads por acabarse (0421, gerencia 07-10): quedarse sin
  // saldo apaga los anuncios, así que se queda hasta que lo toquen.
  saldo_ads: {
    encabezado: "💳 Google Ads: recargar saldo",
    accion: "Ver saldo",
    duracion: Infinity,
    tono: "error",
  },
  // El cliente escribió en un chat que ya tenía (comerciales, 02-10). Se queda
  // hasta que lo toquen, como en el celular; uno por chat (ver `avisar`).
  whatsapp_mensaje: {
    encabezado: "💬 Le escribieron por WhatsApp",
    accion: "Responder",
    duracion: Infinity,
    tono: "success",
  },
  // «Terminé, pueden recogerlo» (0350): quien tenía el file ya acabó y Central
  // tiene que pasar por él. Carlos, 30-09: «que me lleve una notificación para
  // ir a recoger el file». Se queda un rato más que un aviso informativo.
  file_recoger: {
    encabezado: "📁 Listo para recoger",
    accion: "Ir a files",
    duracion: 20000,
    tono: "warning",
  },
  // Alguien pide files a Central (0357). Hasta el 30-09 salía como «Aviso
  // nuevo» con pitido corto; Central pidió «campanita, alarma, ventana
  // emergente» para no perderse ni el pedido ni el recojo.
  file_pedido: {
    encabezado: "📁 Piden files",
    accion: "Ir a files",
    duracion: 20000,
    tono: "warning",
  },
  // Central le llevó el file en la mano sin que lo pidiera, por lo general al
  // generar el pedido (0365, Carlos 01-10). Falta su firma «Recibí el file».
  file_entregado: {
    encabezado: "📁 Central le entregó un file",
    accion: "Firmar «Recibí»",
    duracion: 20000,
    tono: "info",
  },
  otro: {
    encabezado: "Aviso nuevo",
    accion: "Ver",
    duracion: 8000,
    tono: "info",
  },
};

/**
 * ¿El aviso lleva a UN sitio concreto —una oportunidad, una cotización, un
 * pedido— o a una pantalla general?
 *
 * Importa porque el clic se comporta distinto (ver `alClickearNotificacion`).
 * Los avisos con destino concreto llevan el id en la ruta; los generales son
 * la bandeja, el panel, «Mis oportunidades».
 */
function tieneDestinoConcreto(url: string | null): boolean {
  return Boolean(
    url &&
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(url),
  );
}

/** Lo que dice el aviso arriba y su botón, para la página del historial (25-09). */
export function rotuloDeAviso(tipo: string): { encabezado: string; accion: string; tono: "success" | "info" | "warning" | "error" } {
  const e = ESTILO_AVISO[tipo] ?? ESTILO_AVISO.otro;
  return { encabezado: e.encabezado, accion: e.accion, tono: e.tono };
}

/** Cómo se llama el botón cuando el destino es una pantalla general. */
const NOMBRE_DEL_DESTINO: Record<string, string> = {
  "/central": "Ir a la bandeja de Central",
  "/central/cierres": "Ver los cierres",
  "/gerencia": "Ir al panel",
  "/gerencia/aprobaciones": "Ver las aprobaciones pendientes",
  "/operaciones": "Ir a operaciones",
  "/comercial": "Ir a Mi día",
  "/comercial/oportunidades": "Ver mis oportunidades",
  "/comercial/cotizaciones": "Ver mis cotizaciones",
  "/comercial/cartera": "Ver mi cartera",
  "/comercial/cierres": "Ver mis cierres",
  "/postventa": "Ir a postventa",
  "/files": "Ir a files",
};

/**
 * Por qué este aviso no lleva a un sitio exacto, dicho en la ventana.
 *
 * Los avisos de aprobación y rechazo anteriores al 16-09 (0237) salían sin
 * número ni enlace a la cotización: «Gerencia aprobó los precios de su
 * cotización» y nada más. El 17-09 se les puso el enlace a los que se
 * pudieron casar con su cotización por la hora en que gerencia resolvió; los
 * que quedaron son los de cotizaciones que se volvieron a resolver después (un
 * rechazo que luego se corrigió y aprobó) o que ya no existen.
 */
function porQueSinDestino(n: Notificacion): string | null {
  if (n.tipo === "cotizacion_aprobada" || n.tipo === "cotizacion_rechazada") {
    return "Este aviso es de antes del 16 de setiembre y salió sin el número de la cotización, así que no lleva a una pantalla exacta. Los avisos nuevos llevan número, cliente y enlace directo.";
  }
  return null;
}

function tiempoRelativo(iso: string): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return fechaLima(iso);
}

export function CampanaNotificaciones({
  userId,
  rol,
}: {
  userId: string;
  rol?: RolUsuario;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  /** El aviso abierto en su ventana de detalle (solo los que no llevan a un sitio concreto). */
  const [detalle, setDetalle] = useState<Notificacion | null>(null);
  // Lectura perezosa: en el servidor no hay localStorage y `alertaSilenciada`
  // devuelve false sin romperse. No hay desajuste de hidratación porque el
  // desplegable solo se dibuja al abrirlo.
  const [silenciada, setSilenciada] = useState(alertaSilenciada);
  /** Sin leer en toda la base, no solo entre las 15 que se muestran. */
  const [sinLeerTotal, setSinLeerTotal] = useState(0);
  const contenedorRef = useRef<HTMLDivElement>(null);
  /** La ruta al momento del aviso: `avisar` vive dentro del efecto y no ve la actual. */
  const rutaRef = useRef(ruta);
  useEffect(() => {
    rutaRef.current = ruta;
  }, [ruta]);
  /**
   * Los avisos que esta ventana YA conoce, para que el repaso periódico pueda
   * distinguir lo nuevo. Existe por el hallazgo de Santos del 31-08 (ronda de
   * instalación): el canal en tiempo real se le cayó y el repaso actualizaba
   * el numerito EN SILENCIO — la campanita se ponía roja y el lead entraba
   * mudo. El repaso ahora también hace sonar lo que descubre; este set evita
   * que suene dos veces lo que el canal vivo ya anunció.
   */
  const conocidasRef = useRef<Set<string> | null>(null);
  /** El repaso completo, para pedirlo al abrir la campana (29-09). */
  const refrescarRef = useRef<((conRecientes?: boolean) => Promise<void>) | null>(null);

  const noLeidas = Math.max(
    notificaciones.filter((n) => !n.leida_at).length,
    sinLeerTotal,
  );

  /**
   * El aviso que ve y oye la persona cuando entra algo nuevo.
   *
   * Criterios, pedidos el 24-08 («un pitido simpático que no malogre la
   * experiencia» y «una ventanita que diga nuevo ingreso»):
   *
   *  · NO INTERRUMPE. Es un aviso al costado, no un modal: quien está
   *    escribiendo una cotización sigue escribiendo. Un modal en medio de una
   *    llamada con un cliente es peor que no avisar.
   *  · DICE QUÉ HACER. Lleva el botón que lleva al sitio, así el aviso se
   *    resuelve en un clic en vez de obligar a buscar dónde pasó.
   *  · DURA SEGÚN IMPORTE. Un lead nuevo o una aprobación se quedan más tiempo
   *    en pantalla que un aviso informativo.
   *  · EL SONIDO ES OPCIONAL Y SE RECUERDA (ver lib/sonido-alerta.ts).
   */
  function avisar(n: Notificacion) {
    // La pantalla abierta se pone al día sola (RefrescoEnVivo): «Series
    // listas», «Liquidación lista», «Confirmar abono»… cambian lo que se ve.
    window.dispatchEvent(
      new CustomEvent("crm:aviso", { detail: { tipo: n.tipo, url: n.url } }),
    );
    if (n.tipo === "whatsapp_mensaje") {
      avisarWhatsapp(n);
      return;
    }
    // La campanada triple suena EN TODAS LAS CUENTAS cuando el aviso exige
    // hacer algo (orden del 25-08: «para que sientan la presión al menos del
    // sonido»): prospecto nuevo (Central y gerencia), lead derivado
    // (comercial), cotización por aprobar (gerencia), urgencia y files. Los avisos
    // informativos (aprobada/rechazada) conservan el pitido corto.
    const exigeAccion = [
      "lead_registrado",
      "lead_asignado",
      "cotizacion_pendiente",
      "cotizacion_revision",
      "whatsapp_sin_respuesta",
      "saldo_ads",
      "urgencia",
      "urgencia_finanzas",
      "urgencia_almacen",
      // Files: pedir y «Terminé» (Central, 30-09) mueven a alguien a caminar.
      "file_pedido",
      "file_recoger",
    ].includes(n.tipo);
    if (exigeAccion) sonarCampanada(n.id);
    else sonarAlerta(n.id);
    // Para Central, el prospecto nuevo además se queda en pantalla hasta que
    // lo toque (la miden por la entrega rápida).
    const esLeadParaCentral = rol === "central" && n.tipo === "lead_registrado";
    const info = ESTILO_AVISO[n.tipo] ?? ESTILO_AVISO.otro;
    const duracion = esLeadParaCentral ? Infinity : info.duracion;
    toast[info.tono](info.encabezado, {
      description: [n.titulo, n.cuerpo].filter(Boolean).join(" — "),
      duration: duracion,
      // La que no se cierra sola lleva una equis para cerrarla a mano.
      closeButton: !Number.isFinite(duracion),
      action: n.url
        ? {
            label: info.accion,
            onClick: () => router.push(n.url!),
          }
        : undefined,
    });
  }

  /**
   * El mensaje de un cliente, como lo avisa WhatsApp (comerciales, 02-10):
   * su sonido propio, y una ventanita que dice QUIÉN arriba y QUÉ escribió
   * debajo, con «Responder». Una sola por chat: si el mismo cliente vuelve a
   * escribir, la ventanita se reemplaza (id = el chat) en vez de apilarse.
   * Si el chat ya está abierto y a la vista, no se interrumpe: el mensaje
   * aparece en la conversación, igual que en WhatsApp.
   */
  function avisarWhatsapp(n: Notificacion) {
    if (document.visibilityState === "visible" && rutaRef.current === n.url) return;
    sonarWhatsapp(n.id);
    toast.success(`💬 ${n.titulo}`, {
      id: n.url ?? n.id,
      description: n.cuerpo ?? undefined,
      duration: Infinity,
      closeButton: true,
      action: n.url ? { label: "Responder", onClick: () => router.push(n.url!) } : undefined,
    });
  }

  useEffect(() => {
    const supabase = createClient();

    /**
     * Releer la lista desde la base.
     *
     * Existe además del canal en vivo porque el canal no siempre llega: basta
     * que el navegador duerma la pestaña, que se caiga el websocket o que la
     * laptop vuelva de suspensión para que el aviso entre a la base y la
     * campana se quede apagada hasta que la persona recargue. Le pasó a Brenda
     * el 28-08: «no se están prendiendo el color cuando le llegan las
     * notificaciones». Se relee al volver a la pestaña y cada minuto.
     */
    async function refrescar(conRecientes = true) {
      const columnas = "id, tipo, titulo, cuerpo, url, leida_at, created_at";
      // EL REPASO SOLO PIDE LAS PENDIENTES (29-09). Las 15 recientes ya leídas
      // no cambian solas: se piden al entrar, al volver a la pestaña y al abrir
      // la campana. Así cada repaso es una consulta y no dos.
      if (!conRecientes) {
        const pendientes = await supabase
          .from("notificaciones")
          .select(columnas, { count: "exact" })
          .is("leida_at", null)
          .order("created_at", { ascending: false })
          .limit(50);
        if (!pendientes.data) return;
        const sinLeer = pendientes.data;
        const vistos = new Set(sinLeer.map((n) => n.id));
        const ahora = new Date().toISOString();
        // Lo que ya no está pendiente se leyó en otra pestaña: queda en gris.
        setNotificaciones((prev) => [
          ...sinLeer,
          ...prev.filter((n) => !vistos.has(n.id)).map((n) => (n.leida_at ? n : { ...n, leida_at: ahora })),
        ]);
        setSinLeerTotal(pendientes.count ?? sinLeer.length);
        if (conocidasRef.current !== null) {
          const nuevas = sinLeer.filter((n) => !conocidasRef.current!.has(n.id));
          for (const n of sinLeer) conocidasRef.current.add(n.id);
          for (const n of nuevas.slice(0, 3)) avisar(n);
        }
        return;
      }
      // DOS consultas, no una. Antes se pedían solo las 15 más recientes y el
      // número se contaba aparte sobre toda la base: si una pendiente quedaba
      // más atrás de esas 15, la campana marcaba «2» y la lista salía toda en
      // gris. Le pasó a Brenda el 29-08 (dos avisos del 24 con 45 encima).
      // Ahora las pendientes se piden explícitamente y van primero: lo que
      // dice el número es exactamente lo que se ve arriba de la lista.
      const [recientes, pendientes] = await Promise.all([
        supabase
          .from("notificaciones")
          .select(columnas)
          .order("created_at", { ascending: false })
          .limit(15),
        supabase
          .from("notificaciones")
          .select(columnas, { count: "exact" })
          .is("leida_at", null)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      const sinLeer = pendientes.data ?? [];
      const vistos = new Set(sinLeer.map((n) => n.id));
      const leidas = (recientes.data ?? []).filter((n) => !vistos.has(n.id));
      if (recientes.data || pendientes.data)
        setNotificaciones([...sinLeer, ...leidas]);
      setSinLeerTotal(pendientes.count ?? sinLeer.length);

      // EL REPASO TAMBIÉN AVISA (31-08). Si el canal en tiempo real está
      // caído, lo nuevo que este repaso descubre suena y muestra su
      // ventanita igual — un lead jamás entra mudo. En la primera carga solo
      // se memoriza lo que ya había (anunciar lo viejo cada vez que se abre
      // la pantalla sería la campana que miente); de ahí en adelante, todo
      // sin-leer desconocido es nuevo de verdad. Tope de 3 por repaso para
      // que una cola larga no se vuelva un concierto.
      const todas = [...sinLeer, ...leidas];
      if (conocidasRef.current === null) {
        conocidasRef.current = new Set(todas.map((n) => n.id));
      } else {
        const nuevas = sinLeer.filter((n) => !conocidasRef.current!.has(n.id));
        for (const n of todas) conocidasRef.current.add(n.id);
        for (const n of nuevas.slice(0, 3)) avisar(n);
      }
    }

    refrescarRef.current = refrescar;
    refrescar();
    const alVolver = () => {
      if (document.visibilityState === "visible") refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    // SIN CANAL EN TIEMPO REAL (25-09). El canal vivo abría una conexión por
    // pestaña y obligaba a la base a revisar cada aviso contra la seguridad
    // de cada suscriptor: era lo que más recursos gastaba. El repaso ya
    // anunciaba lo nuevo (ventana emergente y sonido) desde el 31-08, así que
    // queda como único camino.
    //
    // MENOS SEGUIDO (29-09). Cada 20 s en cada pestaña eran 1 600 a 3 600
    // consultas por persona al día: la campana era el 16 % de todo lo que
    // recibía la base, con la base saturada y la cuota gastada. Ahora: Central
    // (mide la entrega rápida del prospecto) cada 30 s a la vista y cada
    // minuto en segundo plano; el resto cada minuto a la vista y cada 5 en
    // segundo plano. Al volver a la pestaña se repasa enseguida igual.
    const esCentral = rol === "central";
    const cadaVisible = esCentral ? 30_000 : 60_000;
    const cadaOculta = esCentral ? 60_000 : 300_000;
    let ultimo = Date.now();
    const repaso = setInterval(() => {
      const cada = document.visibilityState === "visible" ? cadaVisible : cadaOculta;
      if (Date.now() - ultimo < cada - 1000) return;
      ultimo = Date.now();
      refrescar(false);
    }, 15_000);

    // EL CANAL VIVO VUELVE, SOLO CON LA BASE LOCAL (29-09). Se apagó el 25-09
    // por lo que costaba en Supabase de la nube; con la base en la VM de la
    // oficina ese costo no existe y Santos pidió la campana al instante, con
    // sonido y ventanita. Se prende con NEXT_PUBLIC_CAMPANA_EN_VIVO=1 (solo en
    // el .env del CRM local): en Vercel, que lee la nube, sigue apagado. El
    // repaso de arriba queda de respaldo por si el canal se corta.
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let vigente = true;
    let soltarEscucha: (() => void) | null = null;
    if (process.env.NEXT_PUBLIC_CAMPANA_EN_VIVO === "1") {
      // El canal se une con el token del usuario: sin él, la base (por RLS) no
      // le manda ninguna fila (24-09). Se renueva cuando la sesión se renueva.
      const { data: escucha } = supabase.auth.onAuthStateChange((_evento, sesion) => {
        if (sesion?.access_token) supabase.realtime.setAuth(sesion.access_token);
      });
      soltarEscucha = () => escucha.subscription.unsubscribe();
      void (async () => {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
        if (!vigente) return;
        canal = supabase
          .channel(`notificaciones-${userId}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "notificaciones", filter: `user_id=eq.${userId}` },
            (payload) => {
              const nueva = payload.new as Notificacion;
              // Si el repaso ya la trajo, no se duplica ni vuelve a sonar.
              if (conocidasRef.current?.has(nueva.id)) return;
              conocidasRef.current?.add(nueva.id);
              // El aviso de WhatsApp REEMPLAZA al pendiente del mismo chat (el
              // servidor ya borró el anterior): no suma uno más al número.
              const reemplaza = (n: Notificacion) =>
                nueva.tipo === "whatsapp_mensaje" && n.tipo === "whatsapp_mensaje" && n.url === nueva.url && !n.leida_at;
              let reemplazadas = 0;
              setNotificaciones((prev) => {
                reemplazadas = prev.filter(reemplaza).length;
                return [nueva, ...prev.filter((n) => n.id !== nueva.id && !reemplaza(n))].slice(0, 50);
              });
              setSinLeerTotal((n) => Math.max(1, n + 1 - reemplazadas));
              avisar(nueva);
            },
          )
          .subscribe();
      })();
    }

    // Deja el audio autorizado con el primer clic: si no, el primer aviso del
    // día llegaría mudo porque el navegador todavía no permite sonido.
    const soltarPreparacion = prepararAlerta();

    return () => {
      vigente = false;
      soltarEscucha?.();
      if (canal) supabase.removeChannel(canal);
      soltarPreparacion();
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      clearInterval(repaso);
    };
    // `avisar` no entra en las dependencias a propósito: se recrearía en cada
    // render y volvería a suscribir el canal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /**
   * Llegar al sitio del aviso ES atenderlo.
   *
   * Un aviso no es una tarea aparte: existe para llevar a la persona a un
   * lugar. Cuando ya está en ese lugar —haya entrado por la campana, por la
   * agenda, por el pipeline o por un enlace— el aviso cumplió y se apaga.
   *
   * Sin esto, la campana acumulaba avisos ya atendidos: la persona hacía el
   * trabajo pero nunca tocaba la campana, y el número se quedaba encendido
   * para siempre señalando algo que ya no existía.
   *
   * La comparación es exacta contra la ruta: estar en el pipeline NO apaga el
   * aviso de una oportunidad concreta, solo entrar a esa oportunidad.
   */
  // Se calcula fuera del efecto para no viajar al servidor en cada navegación:
  // si en esta ruta no hay nada pendiente, no hay nada que apagar. Es fiable
  // porque `refrescar` ya trae TODAS las pendientes, no solo las 15 últimas.
  const pendientesDeEstaRuta = notificaciones
    .filter((n) => !n.leida_at && n.url === ruta)
    .map((n) => n.id)
    .join(",");

  useEffect(() => {
    if (!pendientesDeEstaRuta) return;
    const ids = new Set(pendientesDeEstaRuta.split(","));
    let vigente = true;
    marcarLeidasDelDestino(ruta).then(() => {
      if (!vigente) return;
      const ahora = new Date().toISOString();
      setNotificaciones((prev) =>
        prev.map((n) =>
          ids.has(n.id) ? { ...n, leida_at: n.leida_at ?? ahora } : n,
        ),
      );
      setSinLeerTotal((v) => Math.max(0, v - ids.size));
    });
    return () => {
      vigente = false;
    };
  }, [ruta, pendientesDeEstaRuta]);

  // Mientras Central tenga un prospecto SIN LEER: el título de la pestaña se
  // marca en rojo (se ve aunque esté en otra pestaña) y la campanada se repite
  // cada 2 minutos. Deja de insistir en cuanto lo abre o lo marca como leído.
  // Chrome espacia los timers de pestañas en segundo plano, pero un intervalo
  // de 2 minutos sobrevive a esa restricción.
  const leadsSinLeer =
    rol === "central"
      ? notificaciones.filter(
          (n) => !n.leida_at && n.tipo === "lead_registrado",
        ).length
      : 0;

  // Los chats que escribieron y nadie abrió todavía, el más reciente primero.
  const chatsEsperando = notificaciones.filter((n) => !n.leida_at && n.tipo === "whatsapp_mensaje");
  const firmaChats = chatsEsperando.map((n) => `${n.id}|${n.titulo}`).join(",");

  useEffect(() => {
    anunciarPendientesWhatsapp(chatsEsperando.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaChats]);

  /**
   * EL TÍTULO DE LA PESTAÑA, que se ve aunque la persona esté en otra pestaña
   * o en otro programa con el navegador al costado.
   *
   *  · Central con prospectos sin leer: «🔴 (n)» delante (25-08).
   *  · Chats de WhatsApp esperando (02-10): con la pestaña a la vista, «💬 (n)»
   *    delante; en segundo plano el título PARPADEA entre «💬 (2) Juan y 1
   *    más» y el de la página, como WhatsApp Web — el movimiento es lo que se
   *    nota de reojo.
   *
   * El título original se recuerda aparte: Next lo cambia al navegar, y lo
   * que no empieza con nuestras marcas es el de la página.
   */
  const baseTituloRef = useRef<string | null>(null);
  useEffect(() => {
    const rojos = rol === "central" ? leadsSinLeer : 0;
    const chats = firmaChats ? firmaChats.split(",").map((f) => ({ titulo: f.split("|").slice(1).join("|") })) : [];
    const leerBase = () => {
      if (!/^(🔴|💬) /.test(document.title)) baseTituloRef.current = document.title;
      return baseTituloRef.current ?? document.title;
    };
    let tic = 0;
    const pintar = () => {
      const base = leerBase();
      const rojo = rojos > 0 ? `🔴 (${rojos}) ` : "";
      if (chats.length === 0) {
        document.title = `${rojo}${base}`;
        return;
      }
      tic += 1;
      if (document.visibilityState === "visible") document.title = `${rojo}💬 (${chats.length}) ${base}`;
      // Parpadea los primeros segundos y después se queda en el aviso: Chrome
      // espacia los timers de una pestaña oculta hasta uno por minuto, y un
      // parpadeo así de lento dejaría el aviso escondido la mitad del tiempo.
      else document.title = tic % 2 || tic > 8 ? `${rojo}${tituloDePestanaWhatsapp(chats)}` : `${rojo}${base}`;
    };
    pintar();
    if (chats.length === 0) return;
    const timer = setInterval(pintar, 1500);
    return () => {
      clearInterval(timer);
      document.title = leerBase();
    };
  }, [rol, leadsSinLeer, firmaChats, ruta]);

  // Un chat sin responder vuelve a sonar cada 3 minutos, como el repique de
  // Central: el que salió a atender a alguien vuelve y lo oye.
  useEffect(() => {
    if (!firmaChats) return;
    const timer = setInterval(() => sonarWhatsapp(`repique-wa-${Date.now()}`), 180_000);
    return () => clearInterval(timer);
  }, [firmaChats]);

  useEffect(() => {
    if (rol !== "central" || leadsSinLeer === 0) return;
    const timer = setInterval(
      () => sonarCampanada(`repique-${Date.now()}`),
      120000,
    );
    return () => clearInterval(timer);
  }, [rol, leadsSinLeer]);

  useEffect(() => {
    function alClickearFuera(e: MouseEvent) {
      if (
        contenedorRef.current &&
        !contenedorRef.current.contains(e.target as Node)
      ) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", alClickearFuera);
    return () => document.removeEventListener("mousedown", alClickearFuera);
  }, []);

  /**
   * El clic en un aviso.
   *
   * Si el aviso lleva a un sitio concreto (la oportunidad, la cotización, el
   * pedido), el clic VA AHÍ: el detalle del aviso es esa pantalla, y llegar es
   * atenderlo. Si no —un aviso a una pantalla general, o uno viejo que salió
   * sin enlace—, se abre una ventana con el aviso entero: qué pasó, el texto
   * completo, la fecha y hora exacta, y el botón a la pantalla donde buscarlo.
   *
   * Por qué existe la ventana (Brenda, 17-09): tenía en la campana varios
   * «Gerencia aprobó los precios de su cotización» de antes del 16-09, cuyo
   * destino era «Mis oportunidades» —la pantalla en la que ya estaba—, así que
   * al tocarlos «no aparece nada». Un clic que no hace nada visible es peor
   * que uno que explica por qué no puede llevarla más lejos.
   */
  async function alClickearNotificacion(n: Notificacion) {
    if (!n.leida_at) {
      setNotificaciones((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, leida_at: new Date().toISOString() } : x,
        ),
      );
      setSinLeerTotal((v) => Math.max(0, v - 1));
      await marcarNotificacionLeida(n.id);
    }
    setAbierto(false);
    if (tieneDestinoConcreto(n.url)) {
      router.push(n.url!);
      return;
    }
    setDetalle(n);
  }

  async function alMarcarTodas() {
    setNotificaciones((prev) =>
      prev.map((x) => ({
        ...x,
        leida_at: x.leida_at ?? new Date().toISOString(),
      })),
    );
    setSinLeerTotal(0);
    await marcarTodasLeidas();
  }

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        type="button"
        onClick={() => {
          if (!abierto) refrescarRef.current?.(true);
          setAbierto((v) => !v);
        }}
        className="relative flex items-center justify-center rounded-md border border-border p-2 text-foreground transition-colors hover:bg-accent"
        aria-label={`Notificaciones${noLeidas > 0 ? `, ${noLeidas} sin leer` : ""}`}
      >
        <Bell className="size-4" />
        {noLeidas > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        // En el teléfono (26-09) se abre a todo lo ancho bajo la cabecera: alineado a la
        // campana, que ahí queda a la izquierda, salía de la pantalla.
        <div className="panel-campana fixed inset-x-2 top-14 z-50 rounded-xl border border-border bg-popover shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-80">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">Notificaciones</span>
            <div className="flex items-center gap-3">
              {noLeidas > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs text-primary"
                  onClick={alMarcarTodas}
                >
                  Marcar todas como leídas
                </Button>
              )}
              {/* «Probar sonido» (31-08, ronda de instalación): suena la
                  campanada AHORA, desde el clic — ignora el silencio guardado
                  y la coordinación entre pestañas, porque su único trabajo es
                  demostrar si esta ventana puede sonar. Si ni este botón
                  suena, el mudo es del sitio o del sistema, no del CRM. */}
              <button
                type="button"
                onClick={() => sonarPrueba()}
                className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Suena la campanada de prueba ahora mismo"
              >
                Probar sonido
              </button>
              {/* Silenciar el pitido sin perder el aviso en pantalla. La
                  decisión se recuerda en este navegador: quien trabaja al lado
                  de un cliente lo apaga una vez y listo. */}
              <button
                type="button"
                onClick={() => {
                  const nuevo = !silenciada;
                  setSilenciada(nuevo);
                  silenciarAlerta(nuevo);
                  if (!nuevo) sonarAlerta(`prueba-${Date.now()}`);
                }}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label={
                  silenciada
                    ? "Activar el sonido de los avisos"
                    : "Silenciar el sonido de los avisos"
                }
                title={silenciada ? "Sonido apagado" : "Sonido encendido"}
              >
                {silenciada ? (
                  <VolumeX className="size-4" />
                ) : (
                  <Volume2 className="size-4" />
                )}
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notificaciones.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Sin notificaciones todavía.
              </p>
            ) : (
              notificaciones.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => alClickearNotificacion(n)}
                  className="flex w-full gap-2.5 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-accent"
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 flex-none rounded-full",
                      n.leida_at ? "bg-border" : "bg-primary",
                    )}
                  />
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-xs leading-snug",
                        !n.leida_at && "text-foreground",
                        n.leida_at && "text-muted-foreground",
                      )}
                    >
                      <span className="font-semibold text-foreground">
                        {n.titulo}
                      </span>
                      {n.cuerpo ? ` ${n.cuerpo}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {tiempoRelativo(n.created_at)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
          {/* EL HISTORIAL COMPLETO (25-09): la lista de arriba son las pendientes
              y las 15 más recientes; todas las de los últimos 60 días, acá. */}
          <button
            type="button"
            onClick={() => {
              setAbierto(false);
              router.push("/notificaciones");
            }}
            className="flex w-full items-center justify-center gap-1 border-t border-border px-4 py-2.5 text-xs font-semibold text-primary hover:bg-accent"
          >
            Ver todas mis notificaciones <ArrowRight className="size-3.5" />
          </button>
        </div>
      )}

      <Dialog
        open={detalle !== null}
        onOpenChange={(v) => !v && setDetalle(null)}
      >
        {detalle && (
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="pr-6">
                {(ESTILO_AVISO[detalle.tipo] ?? ESTILO_AVISO.otro).encabezado}
              </DialogTitle>
              <DialogDescription>
                {fechaHoraLima(detalle.created_at)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">
                {detalle.titulo}
              </p>
              {detalle.cuerpo && (
                <p className="whitespace-pre-wrap rounded-md border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-foreground">
                  {detalle.cuerpo}
                </p>
              )}
            </div>
            {porQueSinDestino(detalle) && (
              <p className="text-xs text-muted-foreground">
                {porQueSinDestino(detalle)}
              </p>
            )}
            {detalle.url && (
              <div className="flex justify-end border-t border-border pt-3">
                <Button
                  size="sm"
                  onClick={() => {
                    const destino = detalle.url!;
                    setDetalle(null);
                    router.push(destino);
                  }}
                >
                  {NOMBRE_DEL_DESTINO[detalle.url] ?? "Ir"}{" "}
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
