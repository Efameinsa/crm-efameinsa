// Una foto de una pantalla del CRM tal como la ve un usuario de verdad.
//
// POR QUÉ EXISTE: mirar el HTML no alcanza para revisar un diseño. Esto entra
// con la sesión REAL de quien se le pida, guarda la página sin sus <script> y
// con las hojas de estilo incrustadas —así el navegador no queda esperando al
// HMR ni a una descarga que no llega— y la fotografía con Edge headless, que
// es el camino de la casa. Encontró dos defectos el 29-08 que el HTML no
// mostraba: una línea de texto que estiraba la página entera y tres filtros
// que no entraban en una fila.
//
// Uso:
//   MSYS_NO_PATHCONV=1 CORREO=comercial4@efameinsa.com ANCHO=1440 ALTO=2200
//   node --env-file=.env.local scripts/pantallazo-de-pantalla.mjs "/comercial/ruta" salida.png
//
// OJO: una página con <Suspense> se fotografía con su esqueleto de carga, no
// con el contenido: el contenido lo inserta el JavaScript que se quita.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = process.env.BASE ?? "http://localhost:3000";
const ruta = process.argv[2] ?? "/comercial/ruta";
const salida = path.resolve(process.argv[3] ?? "ruta.png");

const { data: link } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: process.env.CORREO ?? "comercial4@efameinsa.com",
});
const jar = new Map();
const ssr = createServerClient(url, anon, {
  cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)),
  },
});
await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
const cookie = [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");

const html = await (await fetch(`${BASE}${ruta}`, { headers: { cookie } })).text();
// El <base> apunta al servidor de desarrollo para que el CSS de Tailwind
// cargue. Y se sirve por HTTP y no desde el disco: Chrome bloquea que una
// página file:// pida hojas de estilo por http.
// La página se guarda SIN pedir nada por red: los <script> fuera (es una foto,
// y el HMR del servidor de desarrollo deja al navegador esperando para
// siempre) y las hojas de estilo incrustadas. Así el archivo se abre con
// file:// y Edge no queda colgado esperando una descarga que no llega.
let plano = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
for (const [etiqueta, href] of [...plano.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gi)]) {
  const css = await (await fetch(new URL(href, BASE))).text();
  plano = plano.replace(etiqueta, `<style>${css}</style>`);
}
const archivo = path.join(process.env.TEMP ?? ".", "ruta-pantallazo.html");
writeFileSync(archivo, plano, "utf8");

execFileSync(
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--window-size=${process.env.ANCHO ?? 1440},${process.env.ALTO ?? 2200}`,
    `--screenshot=${salida}`,
    `file:///${archivo.replace(/\\/g, "/")}`,
  ],
  { stdio: "inherit" },
);
console.log(`\n${salida}`);
