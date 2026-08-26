// Reportado por Santos 26-08: en el PDF de cotización, LAV180-V1 y LAV1801
// (PRIMUS RX180, gris antracita vs. inox) tenían problemas de imagen y de
// texto. Verificado contra:
//   V:\LESLY\ALLIANCE ok\ESPECIFICACIONES TECNICAS\
//     LAV180-LAVADORA RX180-XCONTROL-100G-GRIS-220V-1PH.docx
//     LAV1801-LAVADORA RX180-X CONTROL FLEX-100G-INOX-220V-1PH.docx
//   V:\LESLY\ALLIANCE ok\CATALOGOS\lavadora-rigida-primus-RX180-RX240-RX280.pdf
//
// LO QUE ESTABA MAL:
// 1. LAV1801 tenía la foto de LAV180 (panel LCD "X Control" básico) en vez de
//    su propia foto -- LAV1801 es "X Control FLEX" con pantalla táctil 7", una
//    unidad visiblemente distinta. Esa foto también traía el logo Primus
//    flotando en una esquina sin centrar. Corregido: se usó la foto real de
//    la unidad Flex que trae su propio Word (más abajo, ilustrando el panel
//    táctil), sin logo flotando -- el logo ya va impreso en el panel.
// 2. Ninguna de las dos tenía logo ni foto de panel como archivo aparte
//    (mecanismo public/productos/<sku>-{logo,panel}.png, igual que
//    SECU1202/1SECU1701/LAV040/SEC75E3). Se agregaron.
// 3. A las dos les faltaba la misma línea en su ficha: la que dice el acabado
//    real del gabinete (gris antracita / inox), y el subtítulo del
//    programador (mismo bug recurrente del extractor que se come el primer
//    subtítulo de cada bloque). Se restituyó tal cual el Word, y se separó
//    "DISEÑO DE CONSTRUCCIÓN" de "AUTOMATIZACIÓN, SEGURIDAD Y CONTROL" como
//    dos bloques (esta ficha no trae TAMBOR/PUERTA internos, es un bloque
//    plano por sección).

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const CAMBIOS = {
  'LAV180-V1': {
    disenoConstruccion: [
      'Sistema de suspensión rígida.',
      'Chasis construido en acero al carbono acabado con imprimación y pintura epóxica de alta temperatura.',
      'Tambor y tina íntegramente en acero inoxidable AISI 304.',
      'Paneles frontales y laterales en Acero gris antracita.',
      'Tambor con tecnología CASCADE DRUM.',
      'Cuenta dos (2) entrada de agua',
      'Acceso fácil a todas las partes importantes desde el frontal de la máquina.',
      'Dispensador de insumos patentada',
      'EasySoap: conexión de detergentes líquidos, compartimientos especiales que evitan desperdicios y mejoran la eficiencia del lavado.',
      'SuperEco Washing Programs: Programas de lavado optimizados para bajo consumo de agua y energía, manteniendo un alto nivel de limpieza. Están diseñados para reducir costos operativos y cumplir con estándares de sostenibilidad.',
      'No hay contacto directo del detergente con la ropa.',
      'Conformidad garantizada con normas higiénicas.',
      'Preparada para uso de productos químicos líquidos.',
    ],
    caracteristicas: [
      'PROGRAMADOR XCONTROL',
      'Panel de control electrónico intuitivo y fácil de usar, con programas preestablecidos.',
      'Rapidez y confiabilidad en la selección de funciones.',
      'Control totalmente programable con 20 programas predefinidos y memoria para hasta 99.',
      'Totalmente programable con capacidad ilimitada de programación de lavado.',
      'Niveles de agua, temperatura y enfriamiento programables.',
      'Panel de control manual para las principales funciones de lavado.',
      'Seguimiento completo de los ciclos de lavado.',
      'Grabación de los parámetros de lavado en memoria.',
      'Entrada USB + conector RS485',
      'Variador de frecuencia que permite ahorro de energía de hasta 30%.',
      'Variador de frecuencia ofrece flexibilidad en velocidades de lavado y centrifugado.',
      'Alta velocidad de centrifugado.',
      'Switch de seguridad de puerta más pistón de bloqueo.',
      'Sensor de seguridad contra desbalance.',
      'Sensor de vibración.',
      'Pulsador de emergencia tipo hongo.',
      'Entrada de detergentes automáticos.',
      'Válvula grande de drenaje.',
      'Mejores resultados con reducción de hasta 30% en consumo de agua.',
      'Porcentaje de humedad extremadamente bajo.',
      'Válvula de drenaje patentada y sensor de nivel de agua de precisión.',
      'Solución sencilla: enchufar y usar.',
    ],
  },
  LAV1801: {
    disenoConstruccion: [
      'Sistema de suspensión rígida.',
      'Chasis construido en acero al carbono acabado con imprimación y pintura epóxica de alta temperatura.',
      'Tambor y tina íntegramente en acero inoxidable AISI 304.',
      'Paneles superiores y laterales en Acero Inoxidable.',
      'Tambor con tecnología CASCADE DRUM.',
      'Cuenta dos (2) entradas de agua.',
      'Acceso fácil a todas las partes importantes desde el frontal de la máquina.',
      'Dispensador de insumos patentada',
      'EasySoap: conexión de detergentes líquidos, compartimientos especiales que evitan desperdicios y mejoran la eficiencia del lavado.',
      'SuperEco Washing Programs: Programas de lavado optimizados para bajo consumo de agua y energía, manteniendo un alto nivel de limpieza. Están diseñados para reducir costos operativos y cumplir con estándares de sostenibilidad.',
      'EasySoap: es un sistema de dosificación inteligente de químicos incorporado en lavadoras industriales RX.',
      'No hay contacto directo del detergente con la ropa.',
      'Conformidad garantizada con normas higiénicas.',
      'Preparada para Dosificación Automática de Químicos',
      'El equipo dispone de 8 salidas de dosificación (24 VAC) para conexión directa con sistemas dosificadores líquidos. Esto asegura una inyección automática, precisa y repetible de detergentes y aditivos en cada ciclo, optimizando costos y calidad de lavado.',
    ],
    caracteristicas: [
      'PROGRAMADOR XCONTROL FLEX',
      'El XControl Flex Plus (Control Touch) es un control táctil intuitivo y totalmente programable.',
      'Pantalla táctil de 7” pulgadas fáciles de usar.',
      'Control totalmente programable con 34 programas.',
      'Totalmente programable con capacidad ilimitada de programación de lavado.',
      'Niveles de agua, temperatura y enfriamiento programables.',
      'Panel de control manual para las principales funciones de lavado.',
      'Seguimiento completo de los ciclos de lavado.',
      'Grabación de los parámetros de lavado en memoria.',
      'Entrada USB + conector RS485',
      'Variador de frecuencia que permite ahorro de energía de hasta 30%.',
      'Variador de frecuencia ofrece flexibilidad en velocidades de lavado y centrifugado.',
      'Alta velocidad de centrifugado.',
      'Switch de seguridad de puerta más pistón de bloqueo.',
      'Sensor de seguridad contra desbalance.',
      'Sensor de vibración.',
      'Pulsador de emergencia tipo hongo.',
      'Entrada de detergentes automáticos.',
      'Válvula grande de drenaje.',
      'Mejores resultados con reducción de hasta 30% en consumo de agua.',
      'Porcentaje de humedad extremadamente bajo.',
      'Válvula de drenaje patentada y sensor de nivel de agua de precisión.',
      'Solución sencilla: enchufar y usar.',
    ],
  },
};

for (const [sku, datos] of Object.entries(CAMBIOS)) {
  const { data: producto, error: errBuscar } = await supabase
    .from('productos')
    .select('id, ficha')
    .eq('sku', sku)
    .single();
  if (errBuscar) { console.error(sku, 'no encontrado:', errBuscar.message); continue; }

  const ficha = {
    ...producto.ficha,
    disenoConstruccion: datos.disenoConstruccion,
    caracteristicas: datos.caracteristicas,
    caracteristicasTitulo: 'AUTOMATIZACIÓN, SEGURIDAD Y CONTROL',
    dimensionesTitulo: 'ESPECIFICACIONES TÉCNICAS',
    medidasTitulo: 'DIMENSIONES',
  };

  const { error: errUpd } = await supabase.from('productos').update({ ficha }).eq('id', producto.id);
  if (errUpd) { console.error(sku, 'error actualizando ficha:', errUpd.message); continue; }
  console.log(sku, '-> ficha corregida:', datos.caracteristicas.length, 'en caracteristicas,', datos.disenoConstruccion.length, 'en disenoConstruccion');
}
process.exit(0);
