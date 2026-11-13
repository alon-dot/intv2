export type ProyectoOficial = {
  numero: number;
  nombre: string;
  subactividades: string[];
};

export const PROYECTOS_OFICIALES: ProyectoOficial[] = [
  { numero: 1, nombre: 'CONSTANCIA DE SITUACIÓN FISCAL Y 32-D', subactividades: ['IMSS', 'SAT', 'INFONAVIT', 'ESTATALES'] },
  { numero: 2, nombre: 'IMPUESTOS', subactividades: ['FEDERALES IMSS', 'FEDERALES SAT', 'FEDERALES INFONAVIT', 'ESTATALES'] },
  { numero: 3, nombre: 'NOMINA', subactividades: [] },
  { numero: 4, nombre: 'FACTURACIÓN Y COMPLEMENTO DE PAGO', subactividades: [] },
  { numero: 5, nombre: 'INFORMATIVAS', subactividades: ['DIOT', 'IEPS', 'ICSOE', 'SISUB', 'SIROC', 'REPSE', 'OTROS'] },
  { numero: 6, nombre: 'SEGURO SOCIAL', subactividades: ['SUA', 'SIPARE', 'IDSE', 'CONCILIACIÓN', 'MOVIMIENTOS', 'ESCRITORIO VIRTUAL', 'PRIMA DE RIESGO DE TRABAJO'] },
  { numero: 7, nombre: 'REGISTRO DE CONTABILIDAD', subactividades: [] },
  { numero: 8, nombre: 'ESTADOS FINANCIEROS', subactividades: [] },
  { numero: 9, nombre: 'PAPELES DE TRABAJO - DETERMINACIÓN DE IMPUESTOS', subactividades: [] },
  { numero: 10, nombre: 'CONTABILIDAD ELECTRÓNICA', subactividades: [] },
  { numero: 11, nombre: 'ATENCIÓN DE FACULTADES DE COMPROBACIÓN', subactividades: [] },
  { numero: 12, nombre: 'MEDIOS DE DEFENSA', subactividades: [] },
  { numero: 13, nombre: 'ATENCIÓN A CLIENTE – REUNIÓN', subactividades: [] },
];
