/**
 * La cola de gestiones sin internet (plan 26, pieza 2).
 *
 * Vive en el NAVEGADOR de cada usuario (IndexedDB): cuando registrar una
 * gestión falla porque no hay red, se guarda acá con un id propio y se
 * reintenta sola — al volver el evento `online`, al abrir la app y cada
 * medio minuto. La sube EL MISMO usuario con SU sesión: la RLS se respeta
 * sola y nadie firma por otro (decisión 5 del plan).
 *
 * El id local hace la subida idempotente del lado de la cola: la gestión se
 * borra de acá solo cuando el servidor respondió bien, y dos disparos del
 * procesador no pueden subir la misma dos veces porque el primero la marca
 * «en vuelo».
 */

export interface GestionEncolada {
  id: string;
  /** Los argumentos de `registrarActividad`, tal cual se habrían enviado. */
  datos: Record<string, unknown>;
  /** Para mostrarla con nombre mientras espera. */
  etiqueta: string;
  creado: string;
  intentos: number;
  /** Por qué no pudo subir la última vez. Para poder decirlo, no para adivinar. */
  ultimoError?: string;
}

const BD = "crm-outbox";
const ALMACEN = "gestiones";

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const pedido = indexedDB.open(BD, 1);
    pedido.onupgradeneeded = () => {
      if (!pedido.result.objectStoreNames.contains(ALMACEN)) {
        pedido.result.createObjectStore(ALMACEN, { keyPath: "id" });
      }
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rechazar(pedido.error);
  });
}

function transaccion<T>(modo: IDBTransactionMode, fn: (a: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrir().then(
    (bd) =>
      new Promise<T>((resolver, rechazar) => {
        const t = bd.transaction(ALMACEN, modo);
        const pedido = fn(t.objectStore(ALMACEN));
        pedido.onsuccess = () => resolver(pedido.result);
        pedido.onerror = () => rechazar(pedido.error);
        t.oncomplete = () => bd.close();
      }),
  );
}

export async function encolarGestion(datos: Record<string, unknown>, etiqueta: string): Promise<string> {
  const fila: GestionEncolada = {
    id: crypto.randomUUID(),
    datos,
    etiqueta,
    creado: new Date().toISOString(),
    intentos: 0,
  };
  await transaccion("readwrite", (a) => a.add(fila));
  return fila.id;
}

export async function gestionesPendientes(): Promise<GestionEncolada[]> {
  const filas = await transaccion<GestionEncolada[]>("readonly", (a) => a.getAll() as IDBRequest<GestionEncolada[]>);
  return filas.sort((x, y) => x.creado.localeCompare(y.creado));
}

async function borrar(id: string): Promise<void> {
  await transaccion("readwrite", (a) => a.delete(id));
}

/** Un solo procesador a la vez: el segundo disparo se va sin hacer nada. */
let procesando = false;

/**
 * Intenta subir todo lo encolado, en orden.
 *
 * `ejecutor` es el server action de siempre; devuelve `{error}` cuando el
 * SERVIDOR contestó (validación: se descarta con aviso, reintentar no la va a
 * arreglar) y LANZA cuando la red no está (se conserva para el próximo
 * intento). Devuelve qué pasó para que la pantalla lo cuente.
 */
/**
 * Cuántas veces se reintenta antes de dejar de insistir sola y avisar.
 *
 * Hasta el 08-09 no había tope: si el fallo era permanente, la cola lo
 * intentaba cada treinta segundos para siempre y la persona solo veía la chapa
 * ámbar sin saber por qué no se iba. El campo `intentos` existía y nunca se
 * incrementaba.
 */
const INTENTOS_ANTES_DE_AVISAR = 5;

async function anotarIntento(g: GestionEncolada, motivo: string): Promise<void> {
  await transaccion("readwrite", (a) => a.put({ ...g, intentos: (g.intentos ?? 0) + 1, ultimoError: motivo }));
}

export async function procesarCola(
  ejecutor: (datos: Record<string, unknown>) => Promise<{ error: string | null }>,
): Promise<{
  subidas: string[];
  rechazadas: { etiqueta: string; error: string }[];
  quedan: number;
  /** Las que ya se intentaron muchas veces y siguen sin poder subir. */
  trabadas: { etiqueta: string; error: string }[];
}> {
  const resultado = {
    subidas: [] as string[],
    rechazadas: [] as { etiqueta: string; error: string }[],
    trabadas: [] as { etiqueta: string; error: string }[],
    quedan: 0,
  };
  if (procesando) return resultado;
  procesando = true;
  try {
    for (const g of await gestionesPendientes()) {
      try {
        const r = await ejecutor(g.datos);
        if (r.error) {
          // El servidor la miró y la rechazó: guardarla más tiempo no la arregla.
          resultado.rechazadas.push({ etiqueta: g.etiqueta, error: r.error });
          await borrar(g.id);
        } else {
          resultado.subidas.push(g.etiqueta);
          await borrar(g.id);
        }
      } catch (err) {
        // TRES MOTIVOS DISTINTOS PARA UN MISMO «LANZÓ», y hasta el 08-09 los
        // tres se trataban como «sigue sin internet».
        const { esDesfaseDeVersion } = await import("@/lib/desfase-de-version");
        if (esDesfaseDeVersion(err)) {
          // La pestaña quedó con la versión vieja: reintentar no sirve, hay
          // que recargar. Se conserva y se avisa quién lo arregla.
          await anotarIntento(g, "El CRM se actualizó: recargue la página y sube sola.");
          resultado.trabadas.push({ etiqueta: g.etiqueta, error: "El CRM se actualizó: recargue la página (Ctrl+F5) y sube sola." });
          break;
        }
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          // Sin internet de verdad: no se cuenta como intento fallido. Es lo
          // que la cola vino a resolver.
          break;
        }
        // Hay internet y aun así falló: se cuenta. Después de varios intentos
        // se deja de insistir sola y se dice qué pasó, en vez de una chapa
        // ámbar eterna sin explicación.
        const motivo = (err as { message?: string })?.message ?? "No se pudo subir";
        await anotarIntento(g, motivo);
        if ((g.intentos ?? 0) + 1 >= INTENTOS_ANTES_DE_AVISAR) {
          resultado.trabadas.push({ etiqueta: g.etiqueta, error: motivo });
        }
        break;
      }
    }
    resultado.quedan = (await gestionesPendientes()).length;
    return resultado;
  } finally {
    procesando = false;
  }
}
