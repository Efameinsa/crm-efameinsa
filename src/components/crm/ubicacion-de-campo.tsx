"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { registrarUbicacionCampo, type LecturaUbicacion } from "@/lib/acciones/ubicacion-campo";
import { INTERVALO_MIN, textoPrecision, type EstadoUbicacion, type OrigenNavegador } from "@/lib/ubicacion-campo";

/**
 * LA UBICACIÓN DEL PILOTO DE TRABAJO DE CAMPO (0363).
 *
 * Ing. Carlos, reunión 01-10-2026 11:05: Brenda (C1) sale a campo martes y
 * viernes con la laptop de la empresa, y gerencia quiere el recorrido «lo más
 * preciso posible … menos de 10 metros … como se mide Uber». La IP no da eso
 * (ubica a la central del proveedor); el navegador sí se acerca: en el
 * celular usa GPS y en la laptop el servicio de ubicación de Windows, que
 * triangula las redes wifi cercanas.
 *
 * Solo se monta para perfiles con `trabajo_de_campo` (el layout lo decide).
 * Lee al ingresar, cada 10 minutos mientras el CRM está abierto y al volver a
 * la pestaña. Si la persona niega el permiso o el equipo no se ubica, ESO
 * también se anota —gerencia ve «no compartió», no un hueco mudo— y el CRM
 * sigue funcionando exactamente igual: este aviso nunca bloquea nada.
 *
 * Con varias pestañas abiertas, la que ya leyó hace menos de 9 minutos le
 * ahorra el trabajo a las demás (marca en localStorage).
 */

const CLAVE_ULTIMA = "campo-ultima-lectura";
const CLAVE_INGRESO = "campo-ingreso-anotado";
const CLAVE_OCULTO = "campo-aviso-oculto";
/** Cuánto se escucha al equipo antes de quedarse con la mejor lectura. */
const ESPERA_MS = 20_000;
/** Si una lectura ya es así de buena, no se espera más. */
const SUFICIENTE_M = 15;

function leer(clave: string, donde: "local" | "session"): string | null {
  try {
    return (donde === "local" ? localStorage : sessionStorage).getItem(clave);
  } catch {
    return null;
  }
}
function guardar(clave: string, valor: string, donde: "local" | "session") {
  try {
    (donde === "local" ? localStorage : sessionStorage).setItem(clave, valor);
  } catch {
    // modo privado o almacenamiento bloqueado: se sigue sin la marca
  }
}

/**
 * La mejor lectura en hasta 20 s. Con wifi la primera suele ser gruesa y las
 * siguientes afinan; por eso se escucha un rato con watchPosition y se queda
 * la de menor radio, en vez de tomar la primera que llega.
 */
function mejorPosicion(): Promise<GeolocationPosition> {
  return new Promise((resolver, rechazar) => {
    let mejor: GeolocationPosition | null = null;
    let ultimoError: GeolocationPositionError | null = null;
    let terminado = false;
    const fin = (error?: GeolocationPositionError) => {
      if (terminado) return;
      terminado = true;
      navigator.geolocation.clearWatch(id);
      clearTimeout(reloj);
      if (mejor) resolver(mejor);
      else rechazar(error ?? ultimoError ?? { code: 3, message: "Sin respuesta del equipo" });
    };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (!mejor || p.coords.accuracy < mejor.coords.accuracy) mejor = p;
        if (p.coords.accuracy <= SUFICIENTE_M) fin();
      },
      (e) => {
        ultimoError = e;
        // Sin permiso no hay nada que esperar; lo demás puede ser pasajero.
        if (e.code === 1) fin(e);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: ESPERA_MS },
    );
    const reloj = setTimeout(() => fin(), ESPERA_MS);
  });
}

function estadoDeError(e: { code?: number }): EstadoUbicacion {
  return e.code === 1 ? "denegado" : e.code === 2 ? "no_disponible" : "tiempo_agotado";
}

const AYUDA: Record<Exclude<EstadoUbicacion, "ok">, string> = {
  denegado:
    "La ubicación está bloqueada en el navegador. Para permitirla: clic en el ícono junto a la dirección → Ubicación → Permitir. El CRM funciona igual.",
  no_disponible:
    "Este equipo no da su ubicación: active Configuración de Windows → Privacidad y seguridad → Ubicación (y el wifi encendido).",
  tiempo_agotado: `El equipo tardó en ubicarse; se vuelve a intentar en ${INTERVALO_MIN} min.`,
  no_soportado: "Este navegador no permite ubicar el equipo. Use Chrome o Edge.",
};

export function UbicacionDeCampo() {
  const [estado, setEstado] = useState<EstadoUbicacion | "pidiendo">("pidiendo");
  const [ultima, setUltima] = useState<{ hora: string; precision: number } | null>(null);
  const [oculto, setOculto] = useState(false);
  const enCurso = useRef(false);

  const registrar = useCallback(async (origen: OrigenNavegador, minimoMin = 0) => {
    if (enCurso.current) return;
    const previa = Number(leer(CLAVE_ULTIMA, "local") ?? 0);
    if (minimoMin > 0 && Date.now() - previa < minimoMin * 60_000) return;
    enCurso.current = true;
    let lectura: LecturaUbicacion;
    try {
      if (!("geolocation" in navigator)) {
        lectura = { origen, estado: "no_soportado", lat: null, lon: null, precision: null, detalle: null };
      } else {
        try {
          const p = await mejorPosicion();
          lectura = {
            origen,
            estado: "ok",
            lat: p.coords.latitude,
            lon: p.coords.longitude,
            precision: p.coords.accuracy,
            detalle: null,
          };
        } catch (e) {
          const err = e as { code?: number; message?: string };
          lectura = { origen, estado: estadoDeError(err), lat: null, lon: null, precision: null, detalle: err.message?.slice(0, 300) ?? null };
        }
      }
      setEstado(lectura.estado);
      if (lectura.estado === "ok") {
        guardar(CLAVE_ULTIMA, String(Date.now()), "local");
        setUltima({
          hora: new Date().toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }),
          precision: lectura.precision ?? 0,
        });
      }
      await registrarUbicacionCampo(lectura);
    } finally {
      enCurso.current = false;
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage solo existe en el navegador
    setOculto(leer(CLAVE_OCULTO, "session") === "1");

    // «Al ingresar»: la primera lectura de la pestaña; recargar no es ingresar.
    const primera = leer(CLAVE_INGRESO, "session") !== "1";
    guardar(CLAVE_INGRESO, "1", "session");
    void registrar(primera ? "ingreso" : "periodica", primera ? 0 : 2);

    const intervalo = setInterval(() => void registrar("periodica", INTERVALO_MIN - 1), INTERVALO_MIN * 60_000);
    const alVolver = () => {
      if (document.visibilityState === "visible") void registrar("periodica", 2);
    };
    document.addEventListener("visibilitychange", alVolver);

    // Si da el permiso después (desde el candado), se anota en el momento.
    let permiso: PermissionStatus | null = null;
    const alCambiarPermiso = () => {
      if (permiso?.state === "granted") void registrar("manual");
    };
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => {
        permiso = p;
        p.addEventListener("change", alCambiarPermiso);
      })
      .catch(() => {});

    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
      permiso?.removeEventListener("change", alCambiarPermiso);
    };
  }, [registrar]);

  if (oculto) return null;

  const problema = estado !== "ok" && estado !== "pidiendo";
  return (
    <div
      className={
        problema
          ? "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm sm:px-4"
          : "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm sm:px-4"
      }
    >
      <MapPin className="size-4 flex-none text-primary" aria-hidden />
      <p className="min-w-0 flex-1 basis-60 text-foreground">
        <span className="font-semibold">Gerencia registra su ubicación durante el piloto de trabajo de campo.</span>{" "}
        <span className="text-muted-foreground">
          {estado === "pidiendo" && "Si el navegador lo pregunta, elija «Permitir»."}
          {estado === "ok" && ultima && `Último registro ${ultima.hora} · ${textoPrecision(ultima.precision)}.`}
          {problema && AYUDA[estado]}
        </span>
      </p>
      <button
        type="button"
        onClick={() => void registrar("manual")}
        className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
      >
        Registrar ahora
      </button>
      <button
        type="button"
        aria-label="Ocultar el aviso (la ubicación se sigue registrando)"
        title="Ocultar el aviso (la ubicación se sigue registrando)"
        onClick={() => {
          guardar(CLAVE_OCULTO, "1", "session");
          setOculto(true);
        }}
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
