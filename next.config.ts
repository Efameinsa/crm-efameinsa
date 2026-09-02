import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El indicador "▲" de esquina inferior (ruta estática/dinámica) NUNCA sale
  // en producción — solo corre bajo `next dev`. Se apaga igual para que las
  // demos del piloto (que sí corren en dev) se vean limpias.
  devIndicators: false,

  // MOSTRAR UN AVANCE SIN DESPLEGARLO. Desde el 31-08 los despliegues van solo
  // a la 1 pm y a las 6 pm (regla de Santos, después de que ocho despliegues en
  // una mañana le rompieran la pantalla a Katerine y a Ariana). Lo de en medio
  // se enseña levantando el CRM en esta máquina y abriéndolo desde otra de la
  // oficina.
  //
  // Sin esta lista eso no funciona y el síntoma engaña: la página llega
  // completa —25 KB de HTML— pero Next BLOQUEA sus propios archivos de estilo y
  // JavaScript cuando el pedido viene de un origen distinto de localhost, así
  // que se ve en blanco. Con `curl` no se nota, porque no manda cabecera de
  // origen; con el navegador, sí.
  //
  // Solo afecta a `next dev`. En producción no interviene.
  // ver1…ver5.localhost: las ranuras de la auditoría de gerencia (0160) en
  // desarrollo; Edge y Chrome resuelven *.localhost solos a esta máquina.
  allowedDevOrigins: ["192.168.10.82", "localhost", "127.0.0.1", "*.localhost"],

  // Los PDFs leen el logo y las fotos con rutas armadas en tiempo de
  // ejecución (join(process.cwd(), …) y foto_path de la base), que el
  // rastreo automático de Next no puede inferir. Se declaran para que viajen
  // dentro de la función serverless: como estáticos ya se sirven por URL,
  // pero eso es otra cosa que poder leerlos con readFileSync.
  outputFileTracingIncludes: {
    "/api/cotizaciones/[id]/pdf": ["./public/logo-efameinsa.png", "./public/productos/**/*"],
    "/api/informes/[id]/pdf": ["./public/logo-efameinsa.png"],
    "/api/reportes/central": ["./public/logo-efameinsa.png"],
    "/api/cotizaciones-historicas/[id]/pdf": ["./public/logo-efameinsa.png"],
  },
};

export default nextConfig;
