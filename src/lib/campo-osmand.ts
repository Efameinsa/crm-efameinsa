/**
 * LO QUE MANDA TRACCAR CLIENT, LEÍDO SIN ADIVINAR (0367).
 *
 * Ing. Carlos (vía Santos, 01-10-2026): el recorrido de Brenda «lo más
 * preciso posible, como Uber o inDrive». Eso es el GPS del celular con una app
 * en segundo plano: Traccar Client, gratuita, que manda cada posición por el
 * protocolo HTTP «OsmAnd». La app tiene dos generaciones y las dos están en
 * las tiendas, así que se aceptan los dos formatos (según el decodificador del
 * propio servidor Traccar, OsmAndProtocolDecoder):
 *
 *  · CLÁSICO (Traccar Client hasta v8, OsmAnd): todo en la URL o en un
 *    formulario: `id`, `lat`, `lon`, `timestamp` (segundos o milisegundos
 *    Unix, o ISO), `accuracy` (m), `speed` (NUDOS), `bearing`/`heading`,
 *    `batt` (0-100). También `location=lat,lon` y `deviceid`.
 *
 *  · JSON (Traccar Client v9 en adelante): cuerpo
 *    `{ device_id, location: { timestamp ISO, coords: { latitude, longitude,
 *    accuracy, speed (m/s), heading }, battery: { level 0-1,
 *    is_charging }, is_moving, activity: { type }, mock, event } }`.
 *    `location` puede llegar como lista si la app manda un lote.
 *
 * Todo se pasa a una misma `PosicionApp`: velocidad en m/s, batería en %,
 * hora del GPS en ISO. Lo que no se entiende queda en null; lo que está fuera
 * de rango invalida la posición (no se guarda) pero NO la petición: un punto
 * malo no puede dejar a la app reintentándolo para siempre.
 */

export interface PosicionApp {
  lat: number;
  lon: number;
  precision_m: number | null;
  velocidad_mps: number | null;
  rumbo: number | null;
  bateria: number | null;
  /** La hora del GPS (ISO). Si la app no la manda, la de llegada. */
  registrada_at: string;
  /** «en movimiento · a pie», «UBICACIÓN SIMULADA»: lo que vale la pena mostrar. */
  detalle: string | null;
}

export interface EnvioApp {
  token: string | null;
  posiciones: PosicionApp[];
  /** Cuántas venían y se descartaron por coordenadas u horas imposibles. */
  descartadas: number;
}

const NUDO_A_MPS = 0.514444;
/** Ni la cola más larga de la app guarda posiciones de hace más de esto. */
const ANTIGUEDAD_MAX_MS = 7 * 24 * 60 * 60_000;
/** Un reloj de celular adelantado unos minutos se tolera; una hora del futuro, no. */
const FUTURO_MAX_MS = 10 * 60_000;
/** Más de 1.000 km/h no es un vendedor en Lima: es un dato roto. */
const VELOCIDAD_MAX_MPS = 300;
/** Lo más que se acepta en un solo envío (un lote de la cola de la app). */
export const LOTE_MAX = 500;

function numero(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function texto(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** Segundos o milisegundos Unix (como el decodificador de Traccar: < 2^31 son segundos), o ISO. */
export function leerHora(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = numero(v);
  if (n != null) return n < 2_147_483_647 ? n * 1000 : n;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

function enRango(n: number | null, min: number, max: number): number | null {
  return n != null && n >= min && n <= max ? n : null;
}

interface Crudo {
  lat: number | null;
  lon: number | null;
  hora: number | null;
  precision: number | null;
  velocidadMps: number | null;
  rumbo: number | null;
  bateria: number | null;
  detalle: string[];
}

/**
 * Valida y normaliza. null: la posición no sirve (sin coordenadas, fuera del
 * planeta, en 0,0 —el «no sé» de muchos GPS—, o con una hora imposible).
 */
function normalizar(c: Crudo, ahora: number): PosicionApp | null {
  if (c.lat == null || c.lon == null) return null;
  if (c.lat < -90 || c.lat > 90 || c.lon < -180 || c.lon > 180) return null;
  if (c.lat === 0 && c.lon === 0) return null;
  const hora = c.hora ?? ahora;
  if (hora > ahora + FUTURO_MAX_MS || hora < ahora - ANTIGUEDAD_MAX_MS) return null;
  return {
    lat: c.lat,
    lon: c.lon,
    // La app manda -1 cuando no sabe: eso es «sin dato», no un número.
    precision_m: enRango(c.precision, 0, 100_000),
    velocidad_mps: enRango(c.velocidadMps, 0, VELOCIDAD_MAX_MPS),
    rumbo: enRango(c.rumbo, 0, 360),
    bateria: enRango(c.bateria, 0, 100),
    registrada_at: new Date(hora).toISOString(),
    detalle: c.detalle.length ? c.detalle.join(" · ").slice(0, 300) : null,
  };
}

/** Formato clásico: parámetros de la URL o de un formulario. */
export function leerParametros(p: URLSearchParams, ahora = Date.now()): EnvioApp {
  const token = texto(p.get("id")) ?? texto(p.get("deviceid"));
  let lat = numero(p.get("lat"));
  let lon = numero(p.get("lon"));
  const junto = p.get("location");
  if ((lat == null || lon == null) && junto) {
    const [a, b] = junto.split(",");
    lat = numero(a);
    lon = numero(b);
  }
  const nudos = numero(p.get("speed"));
  const detalle: string[] = [];
  const cargando = p.get("charge");
  if (cargando === "true" || cargando === "1") detalle.push("cargando");
  const posicion = normalizar(
    {
      lat,
      lon,
      hora: leerHora(p.get("timestamp")),
      precision: numero(p.get("accuracy")),
      velocidadMps: nudos == null || nudos < 0 ? null : nudos * NUDO_A_MPS,
      rumbo: numero(p.get("bearing")) ?? numero(p.get("heading")),
      bateria: numero(p.get("batt")),
      detalle,
    },
    ahora,
  );
  return { token, posiciones: posicion ? [posicion] : [], descartadas: posicion ? 0 : 1 };
}

const ACTIVIDAD: Record<string, string> = {
  still: "quieto",
  on_foot: "a pie",
  walking: "a pie",
  running: "corriendo",
  in_vehicle: "en vehículo",
  on_bicycle: "en bicicleta",
};

function deUbicacionJson(l: Record<string, unknown>, ahora: number): PosicionApp | null {
  const coords = (l.coords ?? {}) as Record<string, unknown>;
  const bateria = (l.battery ?? {}) as Record<string, unknown>;
  const nivel = numero(bateria.level);
  const actividad = texto((l.activity as Record<string, unknown> | undefined)?.type);
  const detalle: string[] = [];
  // Una app de «GPS falso» se delata acá: gerencia tiene que verlo.
  if (l.mock === true || coords.mock === true) detalle.push("UBICACIÓN SIMULADA");
  if (l.is_moving === true) detalle.push("en movimiento");
  if (actividad && actividad !== "unknown") detalle.push(ACTIVIDAD[actividad] ?? actividad);
  if (bateria.is_charging === true) detalle.push("cargando");
  const evento = texto(l.event);
  if (evento && evento !== "motionchange") detalle.push(evento);
  return normalizar(
    {
      lat: numero(coords.latitude),
      lon: numero(coords.longitude),
      hora: leerHora(l.timestamp),
      precision: numero(coords.accuracy),
      velocidadMps: numero(coords.speed),
      rumbo: numero(coords.heading),
      // level viene de 0 a 1 (y -1 si no sabe); se guarda en %.
      bateria: nivel == null || nivel < 0 ? null : nivel <= 1 ? Math.round(nivel * 1000) / 10 : nivel,
      detalle,
    },
    ahora,
  );
}

/** Formato JSON de la app nueva. Acepta `location` suelta o en lista. */
export function leerJson(cuerpo: unknown, ahora = Date.now()): EnvioApp {
  if (!cuerpo || typeof cuerpo !== "object") return { token: null, posiciones: [], descartadas: 0 };
  const raiz = cuerpo as Record<string, unknown>;
  const token = texto(raiz.device_id) ?? texto(raiz.id) ?? texto(raiz.deviceid);
  const ubicaciones = (Array.isArray(raiz.location) ? raiz.location : raiz.location ? [raiz.location] : []).slice(0, LOTE_MAX);
  const posiciones: PosicionApp[] = [];
  let descartadas = 0;
  for (const u of ubicaciones) {
    const p = u && typeof u === "object" ? deUbicacionJson(u as Record<string, unknown>, ahora) : null;
    if (p) posiciones.push(p);
    else descartadas++;
  }
  return { token, posiciones, descartadas };
}

/** El mismo punto repetido dentro de un lote (misma hora del GPS) entra una vez. */
export function sinRepetidos(posiciones: PosicionApp[]): PosicionApp[] {
  const vistas = new Set<string>();
  return posiciones.filter((p) => {
    if (vistas.has(p.registrada_at)) return false;
    vistas.add(p.registrada_at);
    return true;
  });
}

/**
 * El identificador que se escribe en la app: 20 letras y números en cuatro
 * grupos («k7pxm-3hq9r-…»), sin 0/o ni 1/l para que nadie los confunda al
 * tipearlo en el celular. 32 símbolos × 20 = 100 bits: no se adivina.
 */
const ALFABETO = "abcdefghijkmnpqrstuvwxyz23456789";
export function generarToken(aleatorio: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = aleatorio(20);
  const letras = Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]);
  return [0, 5, 10, 15].map((i) => letras.slice(i, i + 5).join("")).join("-");
}

/** Forma de un token válido: lo demás ni se busca en la base. */
export const FORMA_TOKEN = /^[a-z2-9]{5}(-[a-z2-9]{5}){3}$/;

/**
 * Límite de tasa en memoria (un solo proceso en la VM). Ventana fija por
 * clave. Al volver la señal la app vacía su cola de golpe —cientos de envíos
 * en un minuto es normal—, así que el límite por token es holgado; el de los
 * tokens desconocidos, por IP, es corto: ese es el que frena a quien prueba.
 */
export class LimiteDeTasa {
  private cubetas = new Map<string, { desde: number; cuenta: number }>();
  constructor(
    private readonly maximo: number,
    private readonly ventanaMs: number,
  ) {}

  permitir(clave: string, ahora = Date.now()): boolean {
    const c = this.cubetas.get(clave);
    if (!c || ahora - c.desde >= this.ventanaMs) {
      if (this.cubetas.size > 5000) this.limpiar(ahora);
      this.cubetas.set(clave, { desde: ahora, cuenta: 1 });
      return true;
    }
    c.cuenta++;
    return c.cuenta <= this.maximo;
  }

  private limpiar(ahora: number) {
    for (const [k, c] of this.cubetas) if (ahora - c.desde >= this.ventanaMs) this.cubetas.delete(k);
  }
}
