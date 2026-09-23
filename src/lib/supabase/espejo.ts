import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

/**
 * LA SESIÓN ESPEJO DE UNA CUENTA DE DEMOSTRACIÓN (0280).
 *
 * `comercial_test@efameinsa.com` tiene que ver exactamente lo que ve
 * Katerine: su cartera, sus oportunidades, sus cotizaciones. La seguridad
 * por filas de la base decide eso con `auth.uid()`, así que la única forma
 * fiel es leer con una sesión de Katerine. Se abre igual que la auditoría de
 * gerencia (0160): un enlace mágico de un solo uso generado en el servidor,
 * que nunca sale al navegador ni le llega por correo a nadie.
 *
 * Esa sesión NUNCA escribe: el cliente que la usa lleva `fetchSoloLectura`
 * y el proxy rechaza cualquier acción de una cuenta de demostración. Se
 * guarda unos minutos en memoria para no abrir una sesión por clic.
 */

type Galleta = { name: string; value: string };

const VIGENCIA_MS = 40 * 60 * 1000;
const sesiones = new Map<string, { galletas: Galleta[]; vence: number }>();
const enCurso = new Map<string, Promise<Galleta[] | null>>();
const espejos = new Map<string, { original: string; correo: string; vence: number }>();

function admin() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** De qué cuenta es espejo esta cuenta de demostración. */
export async function cuentaOriginal(demoId: string): Promise<{ original: string; correo: string } | null> {
  const c = espejos.get(demoId);
  if (c && c.vence > Date.now()) return c;
  const a = admin();
  const { data: perfil } = await a.from("perfiles").select("espejo_de").eq("id", demoId).maybeSingle();
  const original = (perfil?.espejo_de as string | null) ?? null;
  if (!original) return null;
  const { data: usuario } = await a.auth.admin.getUserById(original);
  const correo = usuario.user?.email;
  if (!correo) return null;
  const r = { original, correo, vence: Date.now() + VIGENCIA_MS };
  espejos.set(demoId, r);
  return r;
}

async function abrirSesion(correo: string): Promise<Galleta[] | null> {
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email: correo });
  if (error || !data?.properties?.hashed_token) return null;
  const tarro = new Map<string, string>();
  const temporal = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => [...tarro].map(([name, value]) => ({ name, value })),
      setAll: (lista) => lista.forEach(({ name, value }) => tarro.set(name, value)),
    },
  });
  const { error: e2 } = await temporal.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  if (e2) return null;
  return [...tarro].map(([name, value]) => ({ name, value }));
}

/** Las cookies de sesión de la cuenta original, listas para un cliente en memoria. */
export async function galletasDelEspejo(demoId: string): Promise<Galleta[] | null> {
  const espejo = await cuentaOriginal(demoId);
  if (!espejo) return null;
  const guardada = sesiones.get(espejo.original);
  if (guardada && guardada.vence > Date.now()) return guardada.galletas;
  // Varias pantallas piden la sesión a la vez al entrar: una sola se abre.
  const pendiente = enCurso.get(espejo.original);
  if (pendiente) return pendiente;
  const p = abrirSesion(espejo.correo)
    .then((galletas) => {
      if (galletas) sesiones.set(espejo.original, { galletas, vence: Date.now() + VIGENCIA_MS });
      return galletas;
    })
    .finally(() => enCurso.delete(espejo.original));
  enCurso.set(espejo.original, p);
  return p;
}
