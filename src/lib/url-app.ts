// La URL pública del CRM, en un solo sitio.
//
// Casi todo el sistema es agnóstico del dominio y debe seguir siéndolo: el
// proxy redirige con `request.nextUrl.clone()`, el service worker usa
// `self.location.origin`, los PDFs de R2 salen por URL firmada desde el
// servidor y el login es por contraseña (no hay magic link ni recuperación por
// correo, así que las Redirect URLs de Supabase no intervienen).
//
// El único caso donde hace falta una URL ABSOLUTA es en los avisos que salen
// del sistema: los correos que n8n manda a Central cuando entra un lead llevan
// un enlace a la bandeja, y ahí un enlace relativo no significa nada. Esos dos
// puntos usaban "https://crm-efameinsa.vercel.app/central" quemado en el
// código; ahora pasan por acá.
//
// ORDEN DE RESOLUCIÓN, pensado para que el cambio a crm.efameinsa.com no
// necesite tocar código ni recordar variables:
//   1. APP_URL — para forzarla a mano (útil en pruebas o si algún día hay
//      staging).
//   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel la pone sola y apunta al dominio
//      de PRODUCCIÓN del proyecto. En cuanto crm.efameinsa.com quede como
//      dominio principal, los enlaces de los correos migran solos.
//   3. El dominio nuevo, como último recurso.
//
// Ojo: el .vercel.app sigue funcionando después de añadir el dominio propio,
// así que no hay ventana en la que los avisos apunten a un sitio muerto.

const DOMINIO_PREVISTO = "https://crm.efameinsa.com";

function normalizar(url: string): string {
  const limpia = url.trim().replace(/\/+$/, "");
  return limpia.startsWith("http") ? limpia : `https://${limpia}`;
}

export function urlApp(): string {
  if (process.env.APP_URL) return normalizar(process.env.APP_URL);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return normalizar(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  return DOMINIO_PREVISTO;
}

/** Enlace absoluto a una ruta del CRM, para lo que se lee fuera del sistema. */
export function enlaceApp(ruta: string): string {
  return `${urlApp()}${ruta.startsWith("/") ? ruta : `/${ruta}`}`;
}
