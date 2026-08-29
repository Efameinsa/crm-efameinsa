"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { marcarLeidasDelDestino, marcarNotificacionLeida, marcarTodasLeidas } from "@/lib/acciones/notificaciones";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fechaLima } from "@/lib/fechas";
import { alertaSilenciada, prepararAlerta, silenciarAlerta, sonarAlerta, sonarCampanada } from "@/lib/sonido-alerta";
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
  { encabezado: string; accion: string; duracion: number; tono: "success" | "info" | "warning" | "error" }
> = {
  lead_registrado: { encabezado: "Nuevo ingreso", accion: "Ver bandeja", duracion: 12000, tono: "info" },
  lead_asignado: { encabezado: "Le derivaron un prospecto", accion: "Atenderlo", duracion: 12000, tono: "info" },
  cotizacion_aprobada: { encabezado: "Gerencia aprobó su cotización", accion: "Enviarla", duracion: 14000, tono: "success" },
  cotizacion_rechazada: { encabezado: "Gerencia devolvió su cotización", accion: "Corregirla", duracion: 14000, tono: "warning" },
  cotizacion_pendiente: { encabezado: "Una cotización espera su aprobación", accion: "Revisarla", duracion: 12000, tono: "warning" },
  // La única que NO se va sola (duración infinita): existe porque un cliente
  // ya reclamó que lo dejaron esperando (25-08, Mi Casita Facilita). Si esta
  // ventanita desapareciera a los 12 segundos como las demás, un comercial
  // que fue al baño vuelve y no se entera. Se queda hasta que la toque.
  urgencia: { encabezado: "🚨 Urgente — un cliente está esperando", accion: "Atenderlo ya", duracion: Infinity, tono: "error" },
  otro: { encabezado: "Aviso nuevo", accion: "Ver", duracion: 8000, tono: "info" },
};

function tiempoRelativo(iso: string): string {
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return fechaLima(iso);
}

export function CampanaNotificaciones({ userId, rol }: { userId: string; rol?: RolUsuario }) {
  const router = useRouter();
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  // Lectura perezosa: en el servidor no hay localStorage y `alertaSilenciada`
  // devuelve false sin romperse. No hay desajuste de hidratación porque el
  // desplegable solo se dibuja al abrirlo.
  const [silenciada, setSilenciada] = useState(alertaSilenciada);
  /** Sin leer en toda la base, no solo entre las 15 que se muestran. */
  const [sinLeerTotal, setSinLeerTotal] = useState(0);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const noLeidas = Math.max(notificaciones.filter((n) => !n.leida_at).length, sinLeerTotal);

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
    // La campanada triple suena EN TODAS LAS CUENTAS cuando el aviso exige
    // hacer algo (orden del 25-08: «para que sientan la presión al menos del
    // sonido»): prospecto nuevo (Central y gerencia), lead derivado
    // (comercial), cotización por aprobar (gerencia) y urgencia. Los avisos
    // informativos (aprobada/rechazada) conservan el pitido corto.
    const exigeAccion = ["lead_registrado", "lead_asignado", "cotizacion_pendiente", "urgencia"].includes(n.tipo);
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
    async function refrescar() {
      const columnas = "id, tipo, titulo, cuerpo, url, leida_at, created_at";
      // DOS consultas, no una. Antes se pedían solo las 15 más recientes y el
      // número se contaba aparte sobre toda la base: si una pendiente quedaba
      // más atrás de esas 15, la campana marcaba «2» y la lista salía toda en
      // gris. Le pasó a Brenda el 29-08 (dos avisos del 24 con 45 encima).
      // Ahora las pendientes se piden explícitamente y van primero: lo que
      // dice el número es exactamente lo que se ve arriba de la lista.
      const [recientes, pendientes] = await Promise.all([
        supabase.from("notificaciones").select(columnas).order("created_at", { ascending: false }).limit(15),
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
      if (recientes.data || pendientes.data) setNotificaciones([...sinLeer, ...leidas]);
      setSinLeerTotal(pendientes.count ?? sinLeer.length);
    }

    refrescar();
    const alVolver = () => {
      if (document.visibilityState === "visible") refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    const repaso = setInterval(refrescar, 60000);

    const canal = supabase
      .channel("notificaciones-propias")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificaciones", filter: `user_id=eq.${userId}` },
        (payload) => {
          const nueva = payload.new as Notificacion;
          setNotificaciones((prev) => [nueva, ...prev].slice(0, 15));
          setSinLeerTotal((n) => n + 1);
          avisar(nueva);
        },
      )
      .subscribe();

    // Deja el audio autorizado con el primer clic: si no, el primer aviso del
    // día llegaría mudo porque el navegador todavía no permite sonido.
    const soltarPreparacion = prepararAlerta();

    return () => {
      supabase.removeChannel(canal);
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
      setNotificaciones((prev) => prev.map((n) => (ids.has(n.id) ? { ...n, leida_at: n.leida_at ?? ahora } : n)));
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
  const leadsSinLeer = rol === "central" ? notificaciones.filter((n) => !n.leida_at && n.tipo === "lead_registrado").length : 0;

  useEffect(() => {
    if (rol !== "central") return;
    const base = document.title.replace(/^🔴 \(\d+\) /, "");
    document.title = leadsSinLeer > 0 ? `🔴 (${leadsSinLeer}) ${base}` : base;
  }, [rol, leadsSinLeer]);

  useEffect(() => {
    if (rol !== "central" || leadsSinLeer === 0) return;
    const timer = setInterval(() => sonarCampanada(`repique-${Date.now()}`), 120000);
    return () => clearInterval(timer);
  }, [rol, leadsSinLeer]);

  useEffect(() => {
    function alClickearFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", alClickearFuera);
    return () => document.removeEventListener("mousedown", alClickearFuera);
  }, []);

  async function alClickearNotificacion(n: Notificacion) {
    if (!n.leida_at) {
      setNotificaciones((prev) => prev.map((x) => (x.id === n.id ? { ...x, leida_at: new Date().toISOString() } : x)));
      setSinLeerTotal((v) => Math.max(0, v - 1));
      await marcarNotificacionLeida(n.id);
    }
    setAbierto(false);
    if (n.url) router.push(n.url);
  }

  async function alMarcarTodas() {
    setNotificaciones((prev) => prev.map((x) => ({ ...x, leida_at: x.leida_at ?? new Date().toISOString() })));
    setSinLeerTotal(0);
    await marcarTodasLeidas();
  }

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
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
        <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">Notificaciones</span>
            <div className="flex items-center gap-3">
              {noLeidas > 0 && (
                <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-primary" onClick={alMarcarTodas}>
                  Marcar todas como leídas
                </Button>
              )}
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
                aria-label={silenciada ? "Activar el sonido de los avisos" : "Silenciar el sonido de los avisos"}
                title={silenciada ? "Sonido apagado" : "Sonido encendido"}
              >
                {silenciada ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notificaciones.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin notificaciones todavía.</p>
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
                    <p className={cn("text-xs leading-snug", !n.leida_at && "text-foreground", n.leida_at && "text-muted-foreground")}>
                      <span className="font-semibold text-foreground">{n.titulo}</span>
                      {n.cuerpo ? ` ${n.cuerpo}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{tiempoRelativo(n.created_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
