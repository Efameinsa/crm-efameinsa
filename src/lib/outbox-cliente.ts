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
export async function procesarCola(
  ejecutor: (datos: Record<string, unknown>) => Promise<{ error: string | null }>,
): Promise<{ subidas: string[]; rechazadas: { etiqueta: string; error: string }[]; quedan: number }> {
  const resultado = { subidas: [] as string[], rechazadas: [] as { etiqueta: string; error: string }[], quedan: 0 };
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
      } catch {
        // La red sigue caída: se detiene acá y se conserva todo lo que queda.
        break;
      }
    }
    resultado.quedan = (await gestionesPendientes()).length;
    return resultado;
  } finally {
    procesando = false;
  }
}
