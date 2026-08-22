import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El indicador "▲" de esquina inferior (ruta estática/dinámica) NUNCA sale
  // en producción — solo corre bajo `next dev`. Se apaga igual para que las
  // demos del piloto (que sí corren en dev) se vean limpias.
  devIndicators: false,

  // Los PDFs leen el logo y las fotos con rutas armadas en tiempo de
  // ejecución (join(process.cwd(), …) y foto_path de la base), que el
  // rastreo automático de Next no puede inferir. Se declaran para que viajen
  // dentro de la función serverless: como estáticos ya se sirven por URL,
  // pero eso es otra cosa que poder leerlos con readFileSync.
  outputFileTracingIncludes: {
    "/api/cotizaciones/[id]/pdf": ["./public/logo-efameinsa.png", "./public/productos/**/*"],
    "/api/informes/[id]/pdf": ["./public/logo-efameinsa.png"],
    "/api/cotizaciones-historicas/[id]/pdf": ["./public/logo-efameinsa.png"],
  },
};

export default nextConfig;
