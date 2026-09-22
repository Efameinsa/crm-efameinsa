/**
 * Une dos fichas del mismo cliente desde la consola, con el mismo RPC que
 * usa el botón «Unir a esta ficha» del CRM (`fusionar_cuentas`, 0272).
 *
 * Pensado para el caso de Inversiones Huamán Ruiz (ítem 10 de la reunión del
 * 22-09): tres fichas — `70965099…` (con RUC, cartera de Ariana) absorbe a
 * `116555a7…` (RUIZ PANGALIMA) y a `15386142…` (- HOSPEDAJE MIGUEL ANGEL).
 * NO SE EJECUTA SOLO: espera a que Gabriela confirme con el file cuál es la
 * ficha buena antes de correr esto.
 *
 * Requiere una sesión real (el RPC pide auth.uid() y valida el código de
 * operaciones), así que entra con magic link como cualquier pantallazo.
 *
 * Uso:
 *   COMO=<email de quien autoriza> ORIGEN=<uuid> DESTINO=<uuid> PIN=<código de operaciones> \
 *   MOTIVO="..." node --env-file=.env.local scripts/_unir-fichas.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const COMO = process.env.COMO;
const ORIGEN = process.env.ORIGEN;
const DESTINO = process.env.DESTINO;
const PIN = process.env.PIN;
const MOTIVO = process.env.MOTIVO;

if (!COMO || !ORIGEN || !DESTINO || !PIN || !MOTIVO) {
  console.error("Faltan variables: COMO, ORIGEN, DESTINO, PIN, MOTIVO");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let link = null;
for (let i = 0; i < 8 && !link; i++) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: COMO });
  if (data?.properties) link = data;
  else await new Promise((r) => setTimeout(r, 4000));
}
if (!link) {
  console.error(`No se pudo generar sesión para ${COMO}`);
  process.exit(1);
}

const jar = new Map();
const sesion = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { error: eSesion } = await sesion.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
if (eSesion) {
  console.error("No se pudo abrir sesión:", eSesion.message);
  process.exit(1);
}

const { data: antesOrigen } = await admin.from("cuentas").select("razon_social, num_doc, fusionada_en").eq("id", ORIGEN).maybeSingle();
const { data: antesDestino } = await admin.from("cuentas").select("razon_social, num_doc").eq("id", DESTINO).maybeSingle();
console.log(`Origen:  ${antesOrigen?.razon_social} (${antesOrigen?.num_doc ?? "sin doc"})`);
console.log(`Destino: ${antesDestino?.razon_social} (${antesDestino?.num_doc ?? "sin doc"})`);
if (antesOrigen?.fusionada_en) {
  console.error("El origen ya está fusionado en otra ficha. Nada que hacer.");
  process.exit(1);
}

const { data, error } = await sesion.rpc("fusionar_cuentas", {
  p_origen: ORIGEN,
  p_destino: DESTINO,
  p_pin: PIN,
  p_motivo: MOTIVO,
});
if (error) {
  console.error("No se pudo unir:", error.message);
  process.exit(1);
}
console.log(data);
