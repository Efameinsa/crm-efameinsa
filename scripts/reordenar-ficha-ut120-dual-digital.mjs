// Reorganiza la ficha de SECU120 / SECU120E / SECU120E2 (control DUAL DIGITAL)
// para que se vea igual de ordenada que SECU1202 en el PDF de cotización:
// separa "DISEÑO DE CONSTRUCCIÓN" (TAMBOR/PUERTA/PANELES/SISTEMA DE
// TRANSMISION/CALEFACCION DE SECADO) de "AUTOMATIZACIÓN, SEGURIDAD Y CONTROL",
// y agrega los títulos reales de sección leídos de la ficha técnica en
// V:\PROYECTO ASIGNADO - JEAN PAUL\FICHAS TECNICAS\UT120\.
// No cambia ningún dato técnico, solo la estructura.

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const skus = ['SECU120', 'SECU120E', 'SECU120E2'];

for (const sku of skus) {
  const { data: producto, error: errBuscar } = await supabase
    .from('productos')
    .select('id, ficha')
    .eq('sku', sku)
    .single();
  if (errBuscar) { console.error(sku, 'no encontrado:', errBuscar.message); continue; }

  const idxTambor = producto.ficha.caracteristicas.indexOf('TAMBOR');
  if (idxTambor === -1) { console.error(sku, 'ya no tiene bloque TAMBOR mezclado, se omite'); continue; }

  const caracteristicas = [
    'PROGRAMADOR DUAL DIGITAL',
    'Programador dual digital en multilenguaje con pantalla LED',
    ...producto.ficha.caracteristicas.slice(0, idxTambor),
  ];
  const disenoConstruccion = producto.ficha.caracteristicas.slice(idxTambor);

  const ficha = {
    ...producto.ficha,
    caracteristicas,
    caracteristicasTitulo: 'AUTOMATIZACIÓN, SEGURIDAD Y CONTROL',
    disenoConstruccion,
    dimensionesTitulo: 'ESPECIFICACIONES TÉCNICAS',
    medidasTitulo: 'DIMENSIONES GENERALES',
  };

  const { error: errUpd } = await supabase.from('productos').update({ ficha }).eq('id', producto.id);
  if (errUpd) { console.error(sku, 'error actualizando ficha:', errUpd.message); continue; }
  console.log(sku, '-> ficha reordenada:', caracteristicas.length, 'items en caracteristicas,', disenoConstruccion.length, 'en disenoConstruccion');
}
process.exit(0);
