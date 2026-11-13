export type TipoPersona = 'FISICA' | 'MORAL';

export type ObligacionSat = {
  id: string;
  nombre: string;
  detalle?: string;
  obligatoria?: boolean;
  predeterminada?: boolean;
};

export type RegimenSat = {
  codigo: string;
  nombre: string;
  obligaciones: ObligacionSat[];
};

const mensual = (id: string, nombre: string, detalle?: string): ObligacionSat => ({
  id,
  nombre,
  detalle: detalle ?? 'Mensual · día 17',
  obligatoria: true,
  predeterminada: true,
});

const anual = (detalle: string): ObligacionSat => ({
  id: 'isr-anual',
  nombre: 'ISR anual',
  detalle,
  obligatoria: true,
  predeterminada: true,
});

export const REGIMENES_SAT: Record<TipoPersona, RegimenSat[]> = {
  FISICA: [
    { codigo: '605', nombre: 'Sueldos y Salarios', obligaciones: [anual('Abril · si rebasa $400,000') ] },
    { codigo: '626', nombre: 'RESICO PF', obligaciones: [mensual('isr-mensual', 'ISR'), mensual('iva-mensual', 'IVA'), anual('Anual') ] },
    { codigo: '612', nombre: 'Actividades Empresariales y Profesionales', obligaciones: [mensual('isr-mensual', 'ISR'), mensual('iva-mensual', 'IVA'), anual('Anual'), { id: 'diot-mensual', nombre: 'DIOT', detalle: 'Informativa mensual', obligatoria: true, predeterminada: true }] },
    { codigo: '606', nombre: 'Arrendamiento', obligaciones: [{ ...mensual('isr-mensual', 'ISR', 'Mensual o trimestral'), obligatoria: false, predeterminada: true }, { ...mensual('iva-mensual', 'IVA', 'Mensual o trimestral'), obligatoria: false, predeterminada: true }, anual('Anual'), { id: 'diot-opcional', nombre: 'DIOT', detalle: 'Opcional', predeterminada: false }] },
    { codigo: '625', nombre: 'Plataformas Tecnológicas', obligaciones: [mensual('pagos-provisionales', 'Pagos provisionales', 'Mensuales'), anual('Anual')] },
  ],
  MORAL: [
    { codigo: '601', nombre: 'Régimen General', obligaciones: [mensual('isr-mensual', 'ISR'), mensual('iva-mensual', 'IVA'), mensual('retenciones', 'Retenciones'), anual('31 de marzo'), { id: 'diot-mensual', nombre: 'DIOT', detalle: 'Informativa mensual', obligatoria: true, predeterminada: true }] },
    { codigo: '626', nombre: 'RESICO PM', obligaciones: [mensual('isr-mensual', 'ISR', 'Flujo de efectivo · día 17'), mensual('iva-mensual', 'IVA'), mensual('retenciones', 'Retenciones'), anual('31 de marzo'), { id: 'diot-mensual', nombre: 'DIOT', detalle: 'Mensual', obligatoria: true, predeterminada: true }] },
    { codigo: '603', nombre: 'Sin Fines Lucrativos', obligaciones: [{ id: 'retenciones', nombre: 'Retenciones', detalle: 'Opcional', predeterminada: false }, { id: 'ingresos-erogaciones', nombre: 'Informativa de ingresos y erogaciones', detalle: 'Anual · 15 de febrero', obligatoria: true, predeterminada: true }, { id: 'diot-opcional', nombre: 'DIOT', detalle: 'Opcional', predeterminada: false }] },
    { codigo: '622', nombre: 'AGAPES - Sector Primario', obligaciones: [{ ...mensual('isr-mensual', 'ISR', 'Opción mensual o semestral'), obligatoria: false, predeterminada: true }, { ...mensual('iva-mensual', 'IVA', 'Opción mensual o semestral'), obligatoria: false, predeterminada: true }, anual('31 de marzo'), { id: 'diot', nombre: 'DIOT', detalle: 'Mensual o semestral', obligatoria: true, predeterminada: true }] },
  ],
};

export function regimenSatLabel(regimen: RegimenSat) {
  return `${regimen.nombre} (${regimen.codigo})`;
}
