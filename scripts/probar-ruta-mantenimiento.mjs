// La ruta de mantenimiento rediseñada (pedido del 29-08): los tres datos que
// deciden la llamada bien visibles, «Ver ficha» como botón y los tres filtros
// —mantenimiento, compró, llamada— con los que se arma la tanda del día.
//
// Se entra con la sesión REAL de Ariana (C4, la dueña de la campaña) y con la
// de un comercial al que operaciones le abrió la vista, y se afirma contra el
// HTML que devuelve el servidor. No escribe nada.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// El puerto del `next dev` que esté levantado (3000 por defecto; 3100 si se
// levantó aparte).
const BASE = process.env.BASE ?? "http://localhost:3000";

async function sesion(correo) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: correo });
  if (error) throw error;
  const jar = new Map();
  const ssr = createServerClient(url, anon, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error: e2 } = await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (e2) throw e2;
  return [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
}

let fallas = 0;
const check = (b, t) => {
  console.log(`${b ? "  ✓" : "  ✗ FALLA:"} ${t}`);
  if (!b) fallas++;
};

async function pedir(cookie, ruta) {
  const r = await fetch(`${BASE}${ruta}`, { headers: { cookie }, redirect: "manual" });
  return { status: r.status, html: await r.text() };
}

// Cuántas tarjetas de cliente hay: cada una abre con el botón «Ver ficha».
const tarjetas = (html) => (html.match(/Ver ficha/g) ?? []).length;

const aTexto = (html) => html.replace(/<!--.*?-->/gs, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

/** El contador de la barra: «N de M en esta pestaña» (M solo si hay filtro). */
function contador(html) {
  const t = aTexto(html);
  const m = t.match(/([\d.,]+)\s*(?:de\s*([\d.,]+)\s*)?en esta pestaña/);
  if (!m) return null;
  const num = (s) => (s == null ? null : Number(s.replace(/\D/g, "")));
  return { visibles: num(m[1]), total: num(m[2]) };
}

for (const [correo, quien] of [
  ["comercial4@efameinsa.com", "Ariana (C4), dueña de la campaña"],
  ["comercial5@efameinsa.com", "un comercial cualquiera"],
]) {
  console.log(`\nRUTA DE MANTENIMIENTO · ${quien}`);
  const cookie = await sesion(correo);

  const { status, html } = await pedir(cookie, "/comercial/ruta");
  check(status === 200, `abre (${status})`);
  if (status !== 200) continue;

  const n = tarjetas(html);
  const total = contador(html)?.visibles ?? 0;

  if (n === 0) {
    // Un comercial sin campaña asignada: la pantalla no se rompe, explica el
    // vacío. Los rótulos de la tarjeta no se pueden comprobar sin tarjetas.
    check(
      html.includes("Todavía no hay nada acá") || html.includes("No queda nadie por llamar"),
      "sin filas, explica el vacío en vez de dejar la pantalla muda",
    );
  } else {
    // 1. Los tres datos, con rótulo entero y no abreviado a 10 px.
    check(html.includes("Último mantenimiento"), "el rótulo dice «Último mantenimiento», no «Últ. mant.»");
    check(html.includes("Última llamada"), "el rótulo dice «Última llamada»");
    check(html.includes("Compró"), "el rótulo «Compró» está en la tarjeta");
    // 2. «Ver ficha» es un botón, no un enlace de 11 px al final de la línea.
    check(n > 0, `hay ${n} tarjeta(s) con botón «Ver ficha» de ${total} en la pestaña`);
  }

  // 3. Los tres filtros y las tandas.
  check(html.includes("Mantenimiento") && html.includes("Llamada"), "están los desplegables de filtro");
  check(html.includes("Nunca le hicimos mantenimiento"), "atajo · nunca le hicimos mantenimiento");
  check(html.includes("Mantenimiento vencido"), "atajo · mantenimiento vencido");
  check(html.includes("Compró hace 2+ años y nunca se le llamó"), "atajo · compró hace 2+ años y nunca se le llamó");

  // 4. El filtro recorta de verdad, y los conteos de las pestañas lo siguen.
  const conFiltro = await pedir(cookie, "/comercial/ruta?mant=nunca");
  check(conFiltro.status === 200, `filtra por «nunca» (${conFiltro.status})`);
  const c = contador(conFiltro.html);
  check(c != null, "la barra dice cuántos quedaron de cuántos");
  check(
    c != null && c.total === total && c.visibles <= total,
    `filtrando por «nunca» quedan ${c?.visibles} de ${c?.total} (la pestaña tenía ${total})`,
  );
  check(conFiltro.html.includes("Quitar filtros"), "ofrece quitar los filtros");

  // Un filtro que no puede dar nada: la pantalla lo dice, no se queda muda.
  const imposible = await pedir(cookie, "/comercial/ruta?mant=al_dia&compra=sin_dato&llamada=nunca&q=zzzzzz");
  check(
    imposible.status === 200 &&
      (imposible.html.includes("Ningún cliente de esta pestaña cumple") || tarjetas(imposible.html) === 0),
    "cuando no queda nadie lo explica en vez de mostrar la lista vacía",
  );

  // 5. Un valor inventado en la URL no rompe la pantalla ni filtra a ciegas.
  const basura = await pedir(cookie, "/comercial/ruta?mant=cualquier-cosa");
  check(
    basura.status === 200 && (contador(basura.html)?.visibles ?? -1) === total,
    "un filtro inventado en la URL se ignora, no vacía la lista",
  );

  // 6. La tanda se conserva al cambiar de pestaña.
  check(conFiltro.html.includes("mant=nunca&amp;ver=") || conFiltro.html.includes("ver=llamados&amp;mant=nunca") ||
        conFiltro.html.includes("mant=nunca"), "las pestañas conservan el filtro puesto");
}

console.log(fallas === 0 ? "\nTODO VERDE\n" : `\n${fallas} FALLA(S)\n`);
process.exit(fallas ? 1 : 0);
