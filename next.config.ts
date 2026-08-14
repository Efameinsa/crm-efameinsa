import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El indicador "▲" de esquina inferior (ruta estática/dinámica) NUNCA sale
  // en producción — solo corre bajo `next dev`. Se apaga igual para que las
  // demos del piloto (que sí corren en dev) se vean limpias.
  devIndicators: false,

  // La generación del PDF de cotización lee archivos con rutas dinámicas
  // (logo + fotos de public/productos según foto_path); el file tracing de
  // Vercel no puede inferirlas, así que se declaran explícitas para que
  // viajen con la función serverless.
  outputFileTracingIncludes: {
    "/api/cotizaciones/[id]/pdf": ["./public/logo-efameinsa.png", "./public/productos/**/*"],
  },
};

export default nextConfig;
