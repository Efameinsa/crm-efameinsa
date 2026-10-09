import { config } from './config';
import { calendarioProximo, fechaLarga } from './fechas';
import type { Persona } from './tipos';

// Se prueban en orden: si un modelo no existe (404), está saturado (500/503) o agotó el cupo (429), pasa al siguiente.
const MODELOS_BASE = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.7-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash-lite',
];
// 400/404 incluidos: Google retira los modelos viejos con un 400 («no longer available»)
const REINTENTABLES = new Set([400, 404, 429, 500, 502, 503, 504]);
// Si todos fallan (saturación pasajera de Google), se espera y se da otra vuelta completa
const ESPERAS_ENTRE_VUELTAS_MS = [5000, 15000];
const API = 'https://generativelanguage.googleapis.com';

export interface CompromisoIA {
  responsable_id: string;
  responsable_nombre: string;
  tarea: string;
  fecha: string;
  hora: string;
  cita: string;
}

export interface ActaIA {
  resumen: string;
  temas: string[];
  acuerdos_generales: string[];
  compromisos: CompromisoIA[];
  transcripcion?: string;
}

const SISTEMA = `Eres el secretario de actas de una empresa peruana. Recibes lo que se habló en una reunión de trabajo (una transcripción automática por voz, que puede venir sin puntuación, con palabras mal reconocidas y nombres mal escritos, o directamente el audio). Tu trabajo es armar el acta y, sobre todo, la lista de COMPROMISOS: tareas concretas que una persona específica se comprometió a hacer o que se le asignaron.

REGLAS PARA LOS COMPROMISOS
1. Al final de la reunión, quien la dirige suele repasar los acuerdos en voz alta («repasemos los acuerdos», «quedamos así», «María: tal cosa para el viernes»). Ese repaso es la fuente principal. Si contradice algo dicho antes, manda el repaso. Si algo se acordó durante la reunión y no aparece en el repaso, inclúyelo igual.
2. Un compromiso = una sola persona + una acción + su plazo. Si una tarea es de dos personas, crea un compromiso para cada una. Si es «de todos» o «del equipo» sin dueño, va en acuerdos_generales, no en compromisos.
3. responsable_id: copia el id EXACTO de la lista de participantes. Reconoce apodos, diminutivos y errores del reconocimiento de voz (por ejemplo «Chucho» o «Jesu» = Jesús; «Mari» = María; «Yésica» = Jessica). Si la persona no está en la lista, deja responsable_id vacío y pon en responsable_nombre el nombre tal como se escuchó.
4. tarea: redáctala como una acción clara que empiece con verbo en infinitivo, específica y completa, con el cliente, documento, monto o lugar que se mencionó («Enviar la cotización de las lavadoras al hotel Los Delfines»). No inventes datos que no se dijeron. Máximo 200 caracteres.
5. fecha (YYYY-MM-DD) usando el CALENDARIO que se te da:
   - «hoy», «mañana», «pasado mañana» según el calendario.
   - «el jueves» = el próximo jueves; si hoy es jueves y no dicen «hoy», es el de la próxima semana.
   - «esta semana» sin día = viernes de esta semana. «la próxima semana» sin día = viernes de la próxima semana.
   - «fin de mes» = último día hábil (lunes a viernes) del mes.
   - «urgente», «ya», «lo antes posible», «ahorita» = hoy.
   - Sin ningún plazo mencionado = fecha vacía.
6. hora (HH:MM, 24 h): «a las 4 de la tarde» = 16:00; «a las 2» o «a las 3» en horario de oficina = 14:00 / 15:00; «a las 9» = 09:00; «mediodía» = 12:00; «antes de las 10» = 10:00; «en la mañana» = 12:00; «en la tarde» = 18:00; «a primera hora» = 09:00; «en una hora» o «en dos horas» = se cuenta desde la hora de término de la reunión. Si solo hay día sin hora, deja hora vacía.
7. cita: fragmento textual breve (máximo 160 caracteres) de lo que se dijo cuando se acordó.
8. NO son compromisos: opiniones, ideas sin dueño, cosas que ya se hicieron, preguntas sin respuesta.

EL ACTA
- resumen: 3 a 6 oraciones claras de lo que se trató y decidió.
- temas: de 2 a 8 temas cortos.
- acuerdos_generales: decisiones del equipo que no tienen un responsable individual.
Escribe en español neutro y profesional.`;

const ESQUEMA_BASE = {
  type: 'OBJECT',
  properties: {
    resumen: { type: 'STRING' },
    temas: { type: 'ARRAY', items: { type: 'STRING' } },
    acuerdos_generales: { type: 'ARRAY', items: { type: 'STRING' } },
    compromisos: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          responsable_id: { type: 'STRING' },
          responsable_nombre: { type: 'STRING' },
          tarea: { type: 'STRING' },
          fecha: { type: 'STRING', description: 'YYYY-MM-DD o vacío' },
          hora: { type: 'STRING', description: 'HH:MM en 24 horas o vacío' },
          cita: { type: 'STRING' },
        },
        required: ['responsable_id', 'responsable_nombre', 'tarea', 'fecha', 'hora', 'cita'],
        propertyOrdering: ['responsable_id', 'responsable_nombre', 'tarea', 'fecha', 'hora', 'cita'],
      },
    },
  },
  required: ['resumen', 'temas', 'acuerdos_generales', 'compromisos'],
  propertyOrdering: ['resumen', 'temas', 'acuerdos_generales', 'compromisos'],
};

function esquema(conTranscripcion: boolean) {
  if (!conTranscripcion) return ESQUEMA_BASE;
  return {
    ...ESQUEMA_BASE,
    properties: { transcripcion: { type: 'STRING' }, ...ESQUEMA_BASE.properties },
    required: ['transcripcion', ...ESQUEMA_BASE.required],
    propertyOrdering: ['transcripcion', ...ESQUEMA_BASE.propertyOrdering],
  };
}

function contexto(participantes: Persona[], inicio: Date, fin: Date, titulo: string) {
  const lista = participantes
    .map((p) => `- id: ${p.id} | nombre: ${p.nombre}${p.apodos ? ` | también le dicen: ${p.apodos}` : ''}${p.cargo ? ` | cargo: ${p.cargo}` : ''}`)
    .join('\n');
  return `REUNIÓN: ${titulo}
INICIO: ${fechaLarga(inicio)} (hora de Lima)
TÉRMINO: ${fechaLarga(fin)} (hora de Lima)

CALENDARIO:
${calendarioProximo(inicio)}

PARTICIPANTES (usa estos id):
${lista || '(no se registraron participantes)'}`;
}

type Parte = { text: string } | { inlineData: { mimeType: string; data: string } } | { fileData: { mimeType: string; fileUri: string } };

async function claveGemini() {
  const c = await config();
  if (!c.gemini_key) throw new Error('Falta la clave de Gemini: configúrala en Ajustes.');
  return c.gemini_key;
}

async function modelos() {
  const preferido = (await config()).gemini_modelo;
  return [preferido, ...MODELOS_BASE].filter((m, i, a) => m && a.indexOf(m) === i) as string[];
}

async function llamar(modelo: string, partes: Parte[], conTranscripcion: boolean): Promise<ActaIA> {
  const clave = await claveGemini();
  const r = await fetch(`${API}/v1beta/models/${modelo}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SISTEMA }] },
      contents: [{ role: 'user', parts: partes }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: esquema(conTranscripcion),
        temperature: 0.2,
        maxOutputTokens: 65000,
      },
    }),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(cuerpo?.error?.message || `HTTP ${r.status}`) as Error & { status?: number };
    err.status = r.status;
    throw err;
  }
  const texto = (cuerpo?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought)
    .map((p: { text: string }) => p.text)
    .join('');
  if (!texto) throw new Error('La IA no devolvió contenido.');
  return JSON.parse(texto) as ActaIA;
}

async function enCascada(partes: Parte[], conTranscripcion: boolean) {
  const MODELOS = await modelos();
  const fallos: string[] = [];
  for (let vuelta = 0; vuelta <= ESPERAS_ENTRE_VUELTAS_MS.length; vuelta++) {
    if (vuelta > 0) await new Promise((r) => setTimeout(r, ESPERAS_ENTRE_VUELTAS_MS[vuelta - 1]));
    for (const modelo of MODELOS) {
      try {
        const acta = await llamar(modelo, partes, conTranscripcion);
        return { acta, modelo };
      } catch (e) {
        const err = e as Error & { status?: number };
        fallos.push(`${modelo}: ${err.status ? `HTTP ${err.status} ` : ''}${err.message.slice(0, 140)}`);
        // 401/403 = clave inválida: no tiene sentido seguir probando
        if (err.status === 401 || err.status === 403) throw new Error(`Gemini rechazó la clave: ${err.message}`);
        // Sin status = respuesta vacía o JSON roto: vale la pena probar otro modelo.
        if (err.status && !REINTENTABLES.has(err.status)) break;
      }
    }
  }
  console.error('[gemini] todos los modelos fallaron', fallos);
  throw new Error(
    `Gemini no respondió (suele ser saturación pasajera de Google; pulsa «Volver a intentar»). Detalle: ${fallos.slice(-MODELOS.length).join(' | ')}`,
  );
}

/** Acta a partir de la transcripción en texto (lo normal: subtítulos en vivo del navegador). */
export async function actaDesdeTexto(o: { transcripcion: string; participantes: Persona[]; inicio: Date; fin: Date; titulo: string }) {
  return enCascada(
    [{ text: `${contexto(o.participantes, o.inicio, o.fin, o.titulo)}\n\nTRANSCRIPCIÓN AUTOMÁTICA:\n"""\n${o.transcripcion}\n"""` }],
    false,
  );
}

/** Sube el audio a Gemini (API de archivos) y espera a que quede listo. */
async function subirAudio(audio: Buffer, mimeType: string) {
  const clave = await claveGemini();
  const inicio = await fetch(`${API}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': clave,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(audio.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: `reunion-${Date.now()}` } }),
  });
  const urlSubida = inicio.headers.get('x-goog-upload-url');
  if (!urlSubida) throw new Error(`Gemini no aceptó el audio (HTTP ${inicio.status}).`);
  const subida = await fetch(urlSubida, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: new Uint8Array(audio),
  });
  const { file } = await subida.json();
  let estado = file;
  for (let i = 0; i < 60 && estado?.state === 'PROCESSING'; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    estado = await (await fetch(`${API}/v1beta/${file.name}`, { headers: { 'x-goog-api-key': clave } })).json();
  }
  if (estado?.state !== 'ACTIVE') throw new Error('Gemini no terminó de procesar el audio.');
  return estado.uri as string;
}

/** Respaldo: si los subtítulos en vivo fallaron, Gemini escucha el audio completo. */
export async function actaDesdeAudio(o: { audio: Buffer; mimeType: string; participantes: Persona[]; inicio: Date; fin: Date; titulo: string }) {
  const parteAudio: Parte =
    o.audio.length < 14 * 1024 * 1024
      ? { inlineData: { mimeType: o.mimeType, data: o.audio.toString('base64') } }
      : { fileData: { mimeType: o.mimeType, fileUri: await subirAudio(o.audio, o.mimeType) } };
  return enCascada(
    [
      parteAudio,
      {
        text: `${contexto(o.participantes, o.inicio, o.fin, o.titulo)}\n\nEl audio adjunto es la reunión completa. Primero escribe en "transcripcion" lo que se dijo (texto corrido, con puntuación). Luego arma el acta y los compromisos.`,
      },
    ],
    true,
  );
}
