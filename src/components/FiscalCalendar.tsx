import { useMemo, useState } from 'react';

type FiscalArea = 'SAT' | 'IMSS' | 'INFONAVIT' | 'ESTATAL';
type FiscalEvent = { id: string; titulo: string; area: FiscalArea; date: Date; detalle?: string };

const AREAS: { id: FiscalArea | 'TODOS'; nombre: string; color: string; badge: string }[] = [
  { id: 'TODOS', nombre: 'Todos', color: 'bg-slate-500', badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  { id: 'SAT', nombre: 'SAT', color: 'bg-blue-600', badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
  { id: 'IMSS', nombre: 'IMSS', color: 'bg-emerald-600', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  { id: 'INFONAVIT', nombre: 'INFONAVIT', color: 'bg-amber-500', badge: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
  { id: 'ESTATAL', nombre: 'Estatales', color: 'bg-violet-600', badge: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' },
];

const CUATRIMESTRES = [
  { month: 0, title: 'Información del cuatrimestre septiembre–diciembre' },
  { month: 4, title: 'Información del cuatrimestre enero–abril' },
  { month: 8, title: 'Información del cuatrimestre mayo–agosto' },
];

function createEvents(year: number): FiscalEvent[] {
  const events: FiscalEvent[] = [];
  const add = (id: string, titulo: string, area: FiscalArea, month: number, day: number, detalle?: string) => {
    events.push({ id, titulo, area, date: new Date(year, month, day), detalle });
  };

  for (let month = 0; month < 12; month += 1) {
    add(`sat-pago-${month}`, 'Pagos provisionales y definitivos', 'SAT', month, 17, 'Vencimiento base: día 17. Puede aplicar prórroga según el sexto dígito numérico del RFC.');
    add(`sat-conta-m-${month}`, 'Contabilidad electrónica · Personas Morales', 'SAT', month, 3);
    add(`sat-conta-f-${month}`, 'Contabilidad electrónica · Personas Físicas', 'SAT', month, 5);
    add(`sat-diot-${month}`, 'DIOT', 'SAT', month, 17, 'Fecha referencial del despacho: día 17.');
    add(`imss-cuotas-${month}`, 'Cuotas obrero patronales', 'IMSS', month, 17, 'Mes inmediato siguiente al periodo de pago.');
    add(`infonavit-cuotas-${month}`, 'Cuotas obrero patronales', 'INFONAVIT', month, 17);
    add(`estatal-nomina-${month}`, 'Impuesto Estatal sobre Nóminas', 'ESTATAL', month, 17, 'Mes inmediato siguiente.');
  }

  add('sat-anual-moral', 'Declaración Anual · Personas Morales', 'SAT', 2, 31, 'Vence el 31 de marzo.');
  add('sat-anual-fisica', 'Declaración Anual · Personas Físicas', 'SAT', 3, 30, 'Vence el 30 de abril.');
  add('imss-prima-riesgo', 'Declaración de Prima de Riesgo', 'IMSS', 1, 28, 'Vence en febrero.');

  CUATRIMESTRES.forEach(({ month, title }, index) => {
    const dueDate = new Date(year, month, 17);
    events.push({ id: `repse-icsoe-${index}`, titulo: 'REPSE / ICSOE', area: 'IMSS', date: dueDate, detalle: `${title} · día 17 del mes siguiente.` });
    events.push({ id: `sisub-${index}`, titulo: 'SISUB', area: 'INFONAVIT', date: dueDate, detalle: `${title} · día 17 del mes siguiente.` });
  });

  return events;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthTitle(date: Date) {
  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(date);
}

function eventArea(area: FiscalArea) {
  return AREAS.find((item) => item.id === area)!;
}

export default function FiscalCalendar() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [filter, setFilter] = useState<FiscalArea | 'TODOS'>('TODOS');
  const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()));
  const events = useMemo(() => createEvents(month.getFullYear()), [month]);
  const visibleEvents = useMemo(() => events.filter((event) => filter === 'TODOS' || event.area === filter), [events, filter]);
  const eventsByDate = useMemo(() => visibleEvents.reduce<Record<string, FiscalEvent[]>>((groups, event) => {
    const key = dateKey(event.date);
    (groups[key] ??= []).push(event);
    return groups;
  }, {}), [visibleEvents]);
  const firstWeekday = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const selectedEvents = eventsByDate[selectedDay] ?? [];
  const todayKey = dateKey(new Date());
  const upcomingEvents = visibleEvents.filter((event) => dateKey(event.date) >= todayKey).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 5);

  function moveMonth(offset: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelectedDay(dateKey(next));
  }

  return <section className="space-y-5">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm font-semibold uppercase tracking-wider text-[#3654A5] dark:text-blue-300">Agenda Fiscal</p><h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Fechas de vencimiento</h2><p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Calendario de referencia con vencimientos SAT, IMSS, INFONAVIT e impuestos estatales.</p></div>
        <div className="flex items-center gap-2 rounded-xl bg-[#010729] px-3 py-2 text-xs font-semibold text-white"><span className="h-2 w-2 rounded-full bg-[#C5A059]" /> Agenda anual {month.getFullYear()}</div>
      </div>
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar por autoridad">
        {AREAS.map((area) => <button key={area.id} type="button" role="tab" aria-selected={filter === area.id} onClick={() => setFilter(area.id)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition ${filter === area.id ? 'bg-[#010729] text-white shadow-sm dark:bg-[#C5A059] dark:text-[#010729]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}>{area.nombre}</button>)}
      </div>
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6" aria-label="Calendario mensual">
        <div className="mb-5 flex items-center justify-between gap-3"><button type="button" onClick={() => moveMonth(-1)} aria-label="Mes anterior" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">←</button><h3 className="text-lg font-bold capitalize text-slate-900 dark:text-white">{monthTitle(month)}</h3><button type="button" onClick={() => moveMonth(1)} aria-label="Mes siguiente" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">→</button></div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:gap-2">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => <div key={day} className="py-2">{day}</div>)}</div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">{Array.from({ length: firstWeekday }, (_, index) => <div key={`empty-${index}`} className="min-h-20 rounded-xl bg-slate-50/60 dark:bg-slate-950/30 sm:min-h-24" />)}{Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day));
          const dayEvents = eventsByDate[key] ?? [];
          const selected = selectedDay === key;
          const areas = [...new Set(dayEvents.map((event) => event.area))];
          return <button key={key} type="button" onClick={() => setSelectedDay(key)} aria-pressed={selected} aria-label={`${day} de ${monthTitle(month)}${dayEvents.length ? `, ${dayEvents.length} vencimientos` : ''}`} className={`min-h-20 rounded-xl border p-1.5 text-left transition sm:min-h-24 sm:p-2 ${selected ? 'border-[#010729] bg-blue-50 ring-1 ring-[#010729] dark:border-[#C5A059] dark:bg-[#172243] dark:ring-[#C5A059]' : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800/70'}`}>
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${key === todayKey ? 'bg-[#C5A059] text-[#010729]' : 'text-slate-700 dark:text-slate-200'}`}>{day}</span>
            <span className="mt-1 flex flex-wrap gap-1">{areas.slice(0, 4).map((area) => <span key={area} className={`h-1.5 w-1.5 rounded-full ${eventArea(area).color}`} />)}</span>
            <span className="mt-1 hidden space-y-1 sm:block">{dayEvents.slice(0, 2).map((event) => <span key={event.id} className={`block truncate rounded px-1 py-0.5 text-[9px] font-semibold ${eventArea(event.area).badge}`}>{event.titulo}</span>)}{dayEvents.length > 2 && <span className="block px-1 text-[9px] text-slate-500">+{dayEvents.length - 2} más</span>}</span>
          </button>;
        })}</div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">{AREAS.slice(1).map((area) => <span key={area.id} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><span className={`h-2 w-2 rounded-full ${area.color}`} />{area.nombre}</span>)}</div>
      </section>

      <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Detalle del día</p><h3 className="mt-1 text-lg font-bold capitalize text-slate-900 dark:text-white">{new Intl.DateTimeFormat('es-MX', { dateStyle: 'full' }).format(new Date(`${selectedDay}T12:00:00`))}</h3>
        {selectedEvents.length > 0 && <ul className="mt-4 space-y-3">{selectedEvents.map((event) => <li key={event.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800"><span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold ${eventArea(event.area).badge}`}>{event.area === 'ESTATAL' ? 'ESTATAL' : event.area}</span><p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">{event.titulo}</p>{event.detalle && <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{event.detalle}</p>}</li>)}</ul>}
        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Próximos vencimientos del año</p>{upcomingEvents.length ? <ul className="mt-2 space-y-2">{upcomingEvents.map((event) => <li key={`next-${event.id}`}><button type="button" onClick={() => setSelectedDay(dateKey(event.date))} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"><span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{event.titulo}</span><span className="block text-[10px] text-slate-500 dark:text-slate-400">{eventArea(event.area).nombre}</span></span><time dateTime={dateKey(event.date)} className="shrink-0 text-xs font-bold text-slate-600 dark:text-slate-300">{new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(event.date)}</time></button></li>)}</ul> : <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">No hay más fechas próximas en este año.</p>}</div>
        <div className="mt-5 rounded-xl border border-[#C5A059]/30 bg-[#C5A059]/10 p-3"><p className="text-xs font-bold text-[#010729] dark:text-[#E8C77F]">Prórroga SAT por sexto dígito del RFC</p><ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300"><li>1–2: +1 día hábil</li><li>3–4: +2 días hábiles</li><li>5–6: +3 días hábiles</li><li>7–8: +4 días hábiles</li><li>9–0: +5 días hábiles</li></ul><p className="mt-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">La prórroga aplicable debe validarse por obligación, calendario oficial y días inhábiles publicados.</p></div>
      </aside>
    </div>
  </section>;
}
