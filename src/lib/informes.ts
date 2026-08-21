// Datos del informe de cierre que NO son acciones de servidor.
//
// Viven aparte de src/lib/acciones/informes.ts porque un módulo marcado con
// "use server" solo puede exportar funciones asíncronas: exportar de ahí una
// constante rompe la compilación ("Failed to collect page data").

// Los beneficios que el modelo real lista bajo "Incluye:". Van como texto
// editable y no como una constante impresa en el PDF porque el ing. Carlos
// pidió justamente poder cambiarlos por cotización ("bonos adicionales" /
// "beneficios generales"), sobre todo con empresa mediana-grande.
export const INCLUYE_POR_DEFECTO = [
  "36 meses de garantía",
  "Juego de manuales de operación, mantenimiento e instalación.",
  "Planos y asesoría para instalación (punto de agua, energía eléctrica, descarga y/o lo requerido para su operación).",
  "Asesoría y capacitación VIRTUAL con nuestros técnicos especializados para la conexión y puesta en marcha, las veces que sean necesarias.",
];
