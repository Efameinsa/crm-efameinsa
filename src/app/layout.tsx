import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "CRM Efameinsa",
  description: "CRM comercial de Efameinsa",
  // El nombre con el que Windows y macOS rotulan la ventana instalada.
  // El `<link rel="manifest">` lo agrega Next solo, por `src/app/manifest.ts`.
  applicationName: "CRM Efameinsa",
  icons: {
    // Safari (iMac, iPhone, iPad) ignora los íconos del manifiesto para el
    // atajo: usa este. Sin él, el ícono en el Dock o en la pantalla de inicio
    // sale como un pantallazo borroso de la pantalla de login.
    apple: "/iconos/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "CRM Efameinsa",
    statusBarStyle: "default",
  },
};

/**
 * `themeColor` pinta la barra de título de la ventana instalada en Windows y la
 * barra de estado en el celular: el granate de marca (#7E1210). Es la mitad de
 * lo que hace que «parezca un programa» y no una pestaña — Santos, 31-08-2026.
 */
export const viewport: Viewport = {
  themeColor: "#7e1210",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <head>
        {/* PILOTO LOCAL (23-09): por la red de la oficina el CRM se abre por
            http://IP:8080, sin candado, y ahí el navegador no trae
            crypto.randomUUID (registro rápido, adjuntos, WhatsApp la usan).
            getRandomValues sí existe siempre: con eso se arma el mismo UUID v4. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if(window.crypto&&!crypto.randomUUID){crypto.randomUUID=function(){var b=crypto.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;var h=[].map.call(b,function(x){return(x+256).toString(16).slice(1)}).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)}}",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
