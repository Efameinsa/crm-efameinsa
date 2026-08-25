/**
 * El pitido que suena cuando llega un aviso nuevo.
 *
 * Pedido del 24-08: «un pitido simpático que no malogre la experiencia de
 * usuario», para Central cuando entran prospectos y para todos cuando les
 * responden una cotización o les asignan un lead.
 *
 * DECISIONES, y por qué:
 *
 *  · SE SINTETIZA, NO SE DESCARGA. Dos notas cortas hechas con el Web Audio
 *    API. No hay archivo que servir ni que se quede a medio cargar, pesa cero
 *    y no depende de ningún dominio externo.
 *
 *  · SUAVE Y CORTO. Dos senoidales de 880 y 1175 Hz (la6 y re7) durante 0,22 s
 *    en total, con entrada y salida en rampa. La rampa importa: un tono que
 *    arranca o corta de golpe hace "clic" y se vuelve molesto a la décima vez.
 *    El volumen queda bajo a propósito — esto suena en una oficina con gente
 *    al lado.
 *
 *  · SI EL NAVEGADOR NO DEJA, NO PASA NADA. Los navegadores bloquean el audio
 *    hasta que la persona interactúa con la página. En vez de pedir permiso o
 *    mostrar un error, el pitido simplemente no suena; el aviso visual sale
 *    igual. El audio se desbloquea solo con el primer clic en cualquier parte.
 *
 *  · SE PUEDE APAGAR, y la decisión se recuerda. Quien no lo quiera lo silencia
 *    una vez.
 */

const CLAVE_SILENCIO = "crm-alerta-silenciada";
/** Evita que suene dos veces si la persona tiene el CRM abierto en dos pestañas. */
const CLAVE_ULTIMO = "crm-alerta-ultimo-aviso";

let contexto: AudioContext | null = null;

/** El navegador solo deja crear audio después de un gesto de la persona. */
function contextoAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    contexto ??= new Ctor();
    return contexto;
  } catch {
    return null;
  }
}

export function alertaSilenciada(): boolean {
  try {
    return localStorage.getItem(CLAVE_SILENCIO) === "1";
  } catch {
    return false;
  }
}

export function silenciarAlerta(silenciar: boolean): void {
  try {
    if (silenciar) localStorage.setItem(CLAVE_SILENCIO, "1");
    else localStorage.removeItem(CLAVE_SILENCIO);
  } catch {
    /* navegador sin almacenamiento: se queda como esté en esta sesión */
  }
}

/**
 * ¿Ya sonó este aviso en otra pestaña?
 *
 * Con el CRM abierto en dos pestañas, el mismo INSERT llega a las dos y sonaría
 * doble. La primera que llega deja su marca; la otra la ve y se calla.
 */
function yaSonoEnOtraPestana(idAviso: string): boolean {
  try {
    const previo = localStorage.getItem(CLAVE_ULTIMO);
    if (previo) {
      const [id, cuando] = previo.split("|");
      if (id === idAviso && Date.now() - Number(cuando) < 5000) return true;
    }
    localStorage.setItem(CLAVE_ULTIMO, `${idAviso}|${Date.now()}`);
  } catch {
    /* sin almacenamiento no se puede coordinar: que suene */
  }
  return false;
}

function nota(ctx: AudioContext, hz: number, empiezaEn: number, dura: number, volumen: number): void {
  const osc = ctx.createOscillator();
  const ganancia = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = hz;

  // Rampa de entrada y salida: sin esto el tono chasquea al empezar y al cortar.
  const t = ctx.currentTime + empiezaEn;
  ganancia.gain.setValueAtTime(0, t);
  ganancia.gain.linearRampToValueAtTime(volumen, t + 0.012);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, t + dura);

  osc.connect(ganancia);
  ganancia.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dura + 0.02);
}

/**
 * Ejecuta `tocar` con el contexto de audio LISTO, esperando la reanudación si
 * hace falta.
 *
 * EL BUG QUE ESTO CORRIGE (25-08, reportado con C0 en laptop): Chrome
 * SUSPENDE el AudioContext de una pestaña en segundo plano o con la laptop
 * en batería. El código anterior llamaba resume() —que es asíncrono— y
 * comprobaba el estado EN LA MISMA LÍNEA: la reanudación aún no había
 * terminado, leía «suspended» y se rendía sin sonar. El aviso salía en la
 * campanita, mudo; y al tocar el altavoz (un clic nuevo) el contexto ya
 * estaba corriendo y "mágicamente" sonaba. Ahora se espera la promesa y se
 * toca al despertar. Solo queda mudo el caso que Chrome no permite de
 * verdad: cero interacción con la página desde que cargó.
 */
function conAudioListo(tocar: (ctx: AudioContext) => void): void {
  const ctx = contextoAudio();
  if (!ctx) return;
  const intentar = () => {
    try {
      tocar(ctx);
    } catch {
      /* que no suene nunca puede romper la pantalla */
    }
  };
  if (ctx.state === "running") {
    intentar();
    return;
  }
  void ctx
    .resume()
    .then(() => {
      if ((ctx.state as string) === "running") intentar();
    })
    .catch(() => {});
}

/** Suena el aviso. Nunca lanza: si no se puede, no suena y ya. */
export function sonarAlerta(idAviso: string): void {
  if (alertaSilenciada()) return;
  if (yaSonoEnOtraPestana(idAviso)) return;
  // Volumen duplicado el 24-08 a pedido: en la oficina el anterior se perdía
  // entre el ruido. Duplicar la amplitud son +6 dB, que es lo que se oye como
  // "el doble de fuerte"; sigue siendo un pitido corto y con rampa, no un
  // timbre. Si quedara alto, los números de motivo() son lo único que hay que
  // bajar. 25-08, segunda subida a pedido: 0.06→0.12 (ayer) →0.24. Otros
  // +6 dB percibidos como el doble. De acá en adelante conviene tocar la
  // salida del sistema, no la síntesis: 0.5 ya es zona de saturación.
  conAudioListo((ctx) => motivo(ctx, 0));
}

/** Las dos notas del aviso, para poder repetirlas. */
function motivo(ctx: AudioContext, desde: number): void {
  nota(ctx, 880, desde, 0.11, 0.24);
  nota(ctx, 1174.7, desde + 0.09, 0.13, 0.2);
}

/**
 * La campanada de prospecto nuevo para Central: el mismo motivo TRES veces
 * seguidas (~1 s). Pedido del 25-08: «un sonido mucho más fuerte» — subir la
 * amplitud ya no se puede sin saturar (ver arriba), así que la notoriedad
 * viene por duración y repetición, que al oído rinde más que el volumen.
 * A ella la miden por la entrega rápida de leads: este es su timbre.
 */
export function sonarCampanada(idAviso: string): void {
  if (alertaSilenciada()) return;
  if (yaSonoEnOtraPestana(idAviso)) return;
  conAudioListo((ctx) => {
    motivo(ctx, 0);
    motivo(ctx, 0.38);
    motivo(ctx, 0.76);
  });
}

/**
 * Deja el audio listo con el primer gesto de la persona.
 *
 * Se llama una vez al montar la campana. Sin esto, el primer aviso del día
 * llegaría mudo porque el navegador todavía no autorizó el sonido.
 */
export function prepararAlerta(): () => void {
  if (typeof window === "undefined") return () => {};
  const desbloquear = () => {
    const ctx = contextoAudio();
    if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", desbloquear, { once: true });
  window.addEventListener("keydown", desbloquear, { once: true });
  return () => {
    window.removeEventListener("pointerdown", desbloquear);
    window.removeEventListener("keydown", desbloquear);
  };
}
