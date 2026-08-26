// Producto nuevo ingresado por Lesly el 26-08 en
// "Modificacion de precio y capacidad secadora ut120 26.08.26.xlsx" (hoja
// "UT055", agregada hoy). Ficha técnica verificada contra:
// V:\LESLY\ALLIANCE ok\ESPECIFICACIONES TECNICAS\
//   SECUT055V-SECADORA UT055-DUAL DIGITAL-DOBLE ROTACION-GALVANIZADO-VAPOR-220V.docx
// (editado hoy mismo, 26-08 17:35).
//
// Contenido, orden de secciones e imágenes (logo, foto, panel) copiados tal
// cual del Word, mismo criterio que las correcciones de hoy: sin inventar
// nada que no esté ahí. Este Word abre con AUTOMATIZACIÓN antes que DISEÑO
// DE CONSTRUCCIÓN (orden por defecto del PDF, no hace falta ordenSecciones).
// ESPECIFICACIONES TÉCNICAS no trae "Capacidad" en el Word -> se marca
// sinCapacidadEnEspecificaciones para que el PDF no la invente (mismo fix
// aplicado hoy a LAV180-V1/LAV1801).
// No hay dato de "ubicación" en este Excel (a diferencia del maestro
// CODIFICACION DE EQUIPOS2, que sí trae esa columna) -> ubicacion_maestro
// queda null, no se inventa "PLANTA".

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ficha = {
  panel: 'DUAL DIGITAL',
  origen: {
    maestro2: 'V:\\LESLY\\Modificacion de precio y capacidad secadora ut120 26.08.26.xlsx',
    confianza: 'alta',
    ficha_tecnica: 'V:\\LESLY\\ALLIANCE ok\\ESPECIFICACIONES TECNICAS\\SECUT055V-SECADORA UT055-DUAL DIGITAL-DOBLE ROTACION-GALVANIZADO-VAPOR-220V.docx',
    maestro2_sync: '2026-08-26',
    foto_prestada_de: null,
    codigo_duplicado_en_maestro: false,
  },
  medidas: [
    'Ancho: 900 mm',
    'Profundidad: 1450 mm',
    'Altura: 1790 mm',
    'Peso: 199 kg',
    'Peso de envío: 217 kg',
  ],
  controles: '220V/60HZ/1-3PH',
  dimensiones: [
    'Volumen del tambor: 490 litros',
    'Profundidad del tambor: 889 mm',
    'Diámetro del tambor: 838 mm',
    'Motor del ventilador: 0.5 KW',
    'Diámetro de aire de salida: 200 mm',
    'Flujo de aire: 700 cfm',
  ],
  calentamiento: 'VAPOR',
  caracteristicasTitulo: 'AUTOMATIZACIÓN, SEGURIDAD Y CONTROL',
  caracteristicas: [
    'PROGRAMADOR DUAL DIGITAL',
    'Programador dual digital en multilenguaje con pantalla LED',
    'Este control permite al operador seleccionar la temperatura ideal, el tiempo de calentamiento y el tiempo de enfriamiento para cada uso.',
    'Programas preestablecidos y libres para control del usuario',
    'Ejecución manual / automática',
    'Programación de temperatura',
    'Control de tiempo de trabajo y fin de ciclo',
    'Sensor de control de temperatura',
    'Programación de tiempo de rotación',
    'Programación de tiempo de reposo reprogramable',
    'Funciones especiales: ciclo antiarrugas al final del secado (rotación prolongada para evitar pliegue) y programa de enfriamiento gradual.',
    'Programa de enfriamiento',
    'Protector térmico',
    'Alarma de fin de ciclo',
    'Flujo de aire radial',
    'Cilindro con doble rotación',
  ],
  disenoConstruccion: [
    'TAMBOR',
    'Fabricado en acero galvanizado',
    'Con agujeros pulidos internamente y paletas especiales para voltear suavemente las prendas.',
    'Provisto con paletas con ángulo y altura adecuados para mejor volteo de las prendas',
    'PUERTA',
    'Fabricado en acero con cerrojo magnético',
    'Visor frontal en vidrio templado',
    'Bisagras extra pesadas',
    'PANELES',
    'Paneles frontal, superior e inferior fabricados en acero estructural con pintura resistente a la temperatura',
    'SISTEMA DE TRANSMISION',
    'Mediante eje de acero bonificado para soportar altas cargas dinámicas y mecánicas',
    'Rodamientos mediante chumaceras de alta capacidad de carga',
    'Poleas balanceadas estática y dinámicamente para evitar desgastes de fajas',
    'Motores de ventilador y accionamiento de alta eficiencia para movimientos del cesto',
    'Turbina de alta eficiencia balanceada estática y dinámicamente',
    'CALEFACCION DE SECADO',
    'Calentamiento a Vapor',
    'Válvula Moduladora a Vapor',
    'Sensor de temperatura',
    'Piloto de encendido de alto rendimiento',
  ],
  dimensionesTitulo: 'ESPECIFICACIONES TÉCNICAS',
  medidasTitulo: 'DIMENSIONES GENERALES',
  sinCapacidadEnEspecificaciones: true,
  stock_referencia: 0,
  ubicacion_maestro: null,
  descripcion_maestro: 'SECADORA INDUSTRIAL  MOD. UT055, CAP. 25 KG, DUAL DIGITAL,  VAPOR , TAMBOR GALVANIZADO, DOBLE ROTACION, 220V/60HZ/1-3PH',
};

const { data: producto, error: errInsert } = await supabase
  .from('productos')
  .insert({
    sku: 'SECUT055V',
    marca: 'UNIMAC',
    modelo: 'UT055',
    nombre: 'SECADORA INDUSTRIAL',
    categoria: 'secadora',
    segmento: 'industrial',
    capacidad: '25 kg',
    foto_path: '/productos/secut055v.png',
    ficha,
  })
  .select('id')
  .single();
if (errInsert) { console.error('Error creando producto:', errInsert.message); process.exit(1); }
console.log('Producto creado:', producto.id);

const { error: errPrecio } = await supabase.from('precios_producto').insert({
  producto_id: producto.id,
  tier: 'base',
  moneda: 'USD',
  precio: 10750,
  vigente_desde: '2026-08-26',
});
if (errPrecio) { console.error('Error creando precio:', errPrecio.message); process.exit(1); }
console.log('Precio creado: 10750 USD');
process.exit(0);
