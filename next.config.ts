import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El indicador "▲" de esquina inferior (ruta estática/dinámica) NUNCA sale
  // en producción — solo corre bajo `next dev`. Se apaga igual para que las
  // demos del piloto (que sí corren en dev) se vean limpias.
  devIndicators: false,

  // La generación del PDF de cotización lee archivos con rutas dinámicas
  // (logo + fotos de public/productos según foto_path); el file tracing de
  // Vercel no puede inferirlas, así que se declaran explícitas para que

  // Las rutas se arman con join(process.cwd(), …), así que el rastreo
  // automático de Next no las ve y hay que declararlas: sin esto el archivo
  // existe como estático (se puede abrir por URL) pero NO viaja dentro de la
  // función serverless, que es quien lo lee para armar el PDF.
  outputFileTracingIncludes: {
    "/api/cotizaciones/[id]/pdf": ["./public/logo-efameinsa.png", "./public/productos/**/*"],
    "/api/informes/[id]/pdf": ["./public/logo-efameinsa.png"],
    "/api/cotizaciones-historicas/[id]/pdf": ["./public/logo-efameinsa.png"],
  },
};

export default nextConfig;
