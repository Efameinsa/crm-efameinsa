/**
 * SERVICIO DE TRANSCRIPCIÓN Y RESUMEN DE LLAMADAS (Santos, 19-10-2026).
 *
 * Corre en la VM `archivo-crm` como servicio `llamadas-ia`. Cada tanto busca en la
 * tabla `llamadas` las que ya tienen audio subido (estado_ia = 'pendiente'), las
 * transcribe con faster-whisper (CPU, int8, prioridad baja para no frenar al CRM),
 * pide el resumen a Claude Haiku y deja:
 *
 *   - el `.txt` junto al audio, con el MISMO nombre y una cabecera legible
 *     (cliente, contacto, comercial, fecha, duración, resumen), también en por-cliente/
 *   - transcripción, resumen e `ia` (jsonb) en la fila, para buscarlos desde el CRM.
 *
 * Un solo proceso a la vez (la VM no tiene GPU). Si falla, reintenta hasta 3 veces.
 * Variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY,
 * LLAMADAS_DIR (como las del CRM); opcionales WHISPER_MODELO, LLAMADAS_IA_UNA_VEZ=1.
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { cabeceraDeTranscripcion, marcaDeTiempo } from "../../src/lib/llamadas.ts";

const RAIZ = process.env.LLAMADAS_DIR ?? "/srv/llamadas";
const PYTHON = process.env.LLAMADAS_PYTHON ?? "/opt/llamadas-ia/bin/python";
const SCRIPT = path.join(path.dirname(new URL(import.meta.url).pathname), "transcribir.py");
const MODELO_IA = process.env.LLAMADAS_MODELO_RESUMEN ?? "claude-haiku-5-5";
const MAX_INTENTOS = 3;
const ESPERA_MS = 30_000;
const MAX_CARACTERES_RESUMEN = 60_000;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !llave) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, llave, { auth: { persistSession: false } });

interface Segmento {
  inicio: number;
  fin: number;
  texto: string;
}
interface Resumen {
  resumen: string;
  proxima_accion: string | null;
  temas: string[];
  compromisos: string[];
  tono: string | null;
}

function registrar(...partes: unknown[]) {
  console.log(new Date().toISOString(), ...partes);
}

function rutaSegura(relativa: string): string {
  const destino = path.resolve(RAIZ, relativa);
  if (!destino.startsWith(path.resolve(RAIZ) + path.sep)) throw new Error(`ruta fuera de la raíz: ${relativa}`);
  return destino;
}

function transcribir(audio: string): Promise<{ duracion: number; segmentos: Segmento[] }> {
  return new Promise((resolve, reject) => {
    const p = spawn("nice", ["-n", "19", PYTHON, SCRIPT, audio, process.env.WHISPER_MODELO ?? "small"], { stdio: ["ignore", "pipe", "pipe"] });
    let salida = "";
    let errores = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (errores += d));
    p.on("error", reject);
    p.on("close", (codigo) => {
      if (codigo !== 0) return reject(new Error(`whisper salió con ${codigo}: ${errores.slice(-400)}`));
      try {
        resolve(JSON.parse(salida));
      } catch {
        reject(new Error(`whisper devolvió algo que no es JSON: ${salida.slice(0, 200)}`));
      }
    });
  });
}

function textoConMarcas(segmentos: Segmento[]): string {
  return segmentos.map((s) => `${marcaDeTiempo(s.inicio)} ${s.texto}`).join("\n");
}

async function resumir(texto: string, contexto: { cliente: string; comercial: string }): Promise<Resumen | null> {
  const llaveIa = process.env.ANTHROPIC_API_KEY;
  if (!llaveIa || texto.trim().length < 40) return null;
  const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": llaveIa,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      // Una llave de usuario de la consola no está atada a un workspace (ver lib/asistente/claude.ts).
      ...(process.env.ANTHROPIC_WORKSPACE_ID?.trim() ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID.trim() } : {}),
    },
    body: JSON.stringify({
      model: MODELO_IA,
      max_tokens: 700,
      system:
        "Resumes llamadas comerciales de Efameinsa (lavandería industrial, equipos y repuestos) para su gerencia. " +
        "La transcripción es automática y puede tener errores; no inventes nada que no se diga. " +
        'Responde SOLO un JSON: {"resumen": "3 a 5 líneas en español", "proxima_accion": "una frase o null", ' +
        '"temas": ["..."], "compromisos": ["quién hace qué y cuándo, solo si se dijo"], "tono": "una palabra: interesado, dudoso, molesto, neutro…"}',
      messages: [{ role: "user", content: `Cliente: ${contexto.cliente}\nComercial: ${contexto.comercial}\n\nTranscripción:\n${texto.slice(0, MAX_CARACTERES_RESUMEN)}` }],
    }),
  });
  if (!respuesta.ok) throw new Error(`resumen: ${respuesta.status} ${(await respuesta.text()).slice(0, 200)}`);
  const cuerpo = (await respuesta.json()) as { content?: { type: string; text?: string }[] };
  const bruto = cuerpo.content?.find((c) => c.type === "text")?.text ?? "";
  const json = /\{[\s\S]*\}/.exec(bruto)?.[0];
  if (!json) throw new Error("resumen: la IA no devolvió JSON");
  const r = JSON.parse(json) as Partial<Resumen>;
  return {
    resumen: String(r.resumen ?? "").trim(),
    proxima_accion: r.proxima_accion ? String(r.proxima_accion).trim() : null,
    temas: Array.isArray(r.temas) ? r.temas.map(String).slice(0, 8) : [],
    compromisos: Array.isArray(r.compromisos) ? r.compromisos.map(String).slice(0, 8) : [],
    tono: r.tono ? String(r.tono).trim() : null,
  };
}

async function procesar(l: { id: string; user_id: string; cuenta_id: string | null; contacto_id: string | null; numero: string; iniciada_at: string; duracion_s: number; ruta_audio: string | null; intentos_ia: number }) {
  if (!l.ruta_audio) throw new Error("la fila no tiene ruta_audio");
  const audio = rutaSegura(l.ruta_audio);
  await fs.access(audio);

  const [{ data: cuenta }, { data: contacto }, { data: perfil }] = await Promise.all([
    l.cuenta_id ? db.from("cuentas").select("razon_social, nombre_comercial, num_doc").eq("id", l.cuenta_id).maybeSingle() : Promise.resolve({ data: null }),
    l.contacto_id ? db.from("contactos").select("nombre, cargo").eq("id", l.contacto_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("perfiles").select("nombre, codigo_comercial").eq("id", l.user_id).maybeSingle(),
  ]);
  const cliente = cuenta?.razon_social || cuenta?.nombre_comercial || null;

  const inicio = Date.now();
  const t = await transcribir(audio);
  const texto = textoConMarcas(t.segmentos);
  registrar(`${l.id}: transcrita (${t.duracion} s de audio en ${Math.round((Date.now() - inicio) / 1000)} s)`);

  let ia: Resumen | null = null;
  try {
    ia = await resumir(texto, { cliente: cliente ?? "sin ficha", comercial: perfil?.nombre ?? "—" });
  } catch (e) {
    // La transcripción ya está hecha: un fallo del resumen no la tira (queda sin resumen).
    registrar(`${l.id}: sin resumen →`, e instanceof Error ? e.message : e);
  }

  const cabecera = cabeceraDeTranscripcion({
    cliente,
    documento: cuenta?.num_doc,
    contacto: contacto?.nombre,
    cargo: contacto?.cargo,
    comercial: perfil?.nombre,
    codigoComercial: perfil?.codigo_comercial,
    iniciada_at: l.iniciada_at,
    duracion_s: l.duracion_s,
    numero: l.numero,
    resumen: ia?.resumen,
    proximaAccion: ia?.proxima_accion,
  });
  const contenido = `${cabecera}\n${texto || "(no se entendió ninguna palabra)"}\n`;

  // Mismo nombre que el audio, con .txt, al lado y en por-cliente (enlace duro, no copia).
  const rutaTxt = l.ruta_audio.replace(/\.[^./]+$/, ".txt");
  const destinoTxt = rutaSegura(rutaTxt);
  await fs.writeFile(`${destinoTxt}.parte`, contenido, "utf8");
  await fs.rename(`${destinoTxt}.parte`, destinoTxt);
  await enlazarEnCliente(l.ruta_audio, destinoTxt);

  const { error } = await db
    .from("llamadas")
    .update({
      estado_ia: "listo",
      ruta_transcripcion: rutaTxt,
      transcripcion: contenido,
      resumen: ia?.resumen ?? null,
      ia: ia ? { proxima_accion: ia.proxima_accion, temas: ia.temas, compromisos: ia.compromisos, tono: ia.tono, modelo: MODELO_IA, whisper: process.env.WHISPER_MODELO ?? "small" } : null,
      ia_at: new Date().toISOString(),
      error_ia: null,
    })
    .eq("id", l.id);
  if (error) throw new Error(`no se guardó en la base: ${error.message}`);
}

/** Pone el .txt también en la carpeta del cliente, junto al audio que ya está ahí. */
async function enlazarEnCliente(rutaAudio: string, txtEnDisco: string) {
  const nombreAudio = path.basename(rutaAudio);
  const carpetas = await fs.readdir(path.join(RAIZ, "por-cliente"), { withFileTypes: true }).catch(() => []);
  for (const c of carpetas) {
    if (!c.isDirectory()) continue;
    const candidato = path.join(RAIZ, "por-cliente", c.name, nombreAudio);
    if (await fs.access(candidato).then(() => true, () => false)) {
      const destino = path.join(path.dirname(candidato), path.basename(txtEnDisco));
      await fs.rm(destino, { force: true });
      await fs.link(txtEnDisco, destino);
      return;
    }
  }
}

async function tomarUna() {
  const { data } = await db
    .from("llamadas")
    .select("id, user_id, cuenta_id, contacto_id, numero, iniciada_at, duracion_s, ruta_audio, intentos_ia")
    .eq("estado_audio", "subido")
    .eq("estado_ia", "pendiente")
    .lt("intentos_ia", MAX_INTENTOS)
    .order("iniciada_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  // Se marca como «procesando» solo si sigue pendiente (un único servicio corre, esto es el cinturón).
  const { data: tomada } = await db.from("llamadas").update({ estado_ia: "procesando" }).eq("id", data.id).eq("estado_ia", "pendiente").select("id").maybeSingle();
  return tomada ? data : null;
}

async function ciclo(): Promise<boolean> {
  const l = await tomarUna();
  if (!l) return false;
  try {
    await procesar(l);
    registrar(`${l.id}: lista`);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    const intentos = l.intentos_ia + 1;
    registrar(`${l.id}: error (${intentos}/${MAX_INTENTOS}) →`, mensaje);
    await db.from("llamadas").update({ estado_ia: intentos >= MAX_INTENTOS ? "error" : "pendiente", intentos_ia: intentos, error_ia: mensaje.slice(0, 500) }).eq("id", l.id);
  }
  return true;
}

async function main() {
  // Si el servicio se cayó a media transcripción, esas llamadas vuelven a la cola.
  await db.from("llamadas").update({ estado_ia: "pendiente" }).eq("estado_ia", "procesando");
  registrar(`llamadas-ia listo · raíz ${RAIZ} · whisper ${process.env.WHISPER_MODELO ?? "small"} · resumen ${MODELO_IA}`);
  const unaVez = process.env.LLAMADAS_IA_UNA_VEZ === "1";
  for (;;) {
    let hizo = false;
    try {
      hizo = await ciclo();
    } catch (e) {
      registrar("ciclo:", e instanceof Error ? e.message : e);
    }
    if (unaVez && !hizo) return;
    if (!hizo) await new Promise((r) => setTimeout(r, ESPERA_MS));
  }
}

await main();
