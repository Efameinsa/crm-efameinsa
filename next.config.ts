import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La generación del PDF de cotización lee archivos con rutas dinámicas
  // (logo + fotos de public/productos según foto_path); el file tracing de
  // Vercel no puede inferirlas, así que se declaran explícitas para que
  // viajen con la función serverless.
  outputFileTracingIncludes: {
    "/api/cotizaciones/[id]/pdf": ["./public/logo-efameinsa.png", "./public/productos/**/*"],
  },
};

export default nextConfig;
