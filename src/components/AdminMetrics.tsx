import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell, type Profile, type Task } from './DashboardShared';
import { supabase } from '../lib/supabaseClient';

type TimeEntrySummary = {
  duration_minutes: number;
  client_id?: string;
  user_id?: string;
  created_at: string;
  start_time: string | null;
};

type ClientData = {
  id: string;
  name: string;
};

type DateFilterMode = 'all' | 'today' | 'week' | 'month' | 'custom';

export default function AdminMetrics() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [entries, setEntries] = useState<TimeEntrySummary[]>([]);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Estados para el filtro de fechas
  const [filterMode, setFilterMode] = useState<DateFilterMode>('month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const load = useCallback(async () => {
    const [profileResult, taskResult, entryResult, clientResult] = await Promise.all([
      supabase.from('profiles').select('id,full_name,role').order('full_name'),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('time_entries').select('duration_minutes,client_id,user_id,created_at,start_time'),
      supabase.from('clients').select('id,name'),
    ]);

    setProfiles(profileResult.data ?? []);
    setTasks(taskResult.data ?? []);
    setEntries(entryResult.data ?? []);
    setClients(clientResult.data ?? []);
    
    setError(
      profileResult.error?.message ?? 
      taskResult.error?.message ?? 
      entryResult.error?.message ?? 
      clientResult.error?.message ?? 
      null
    );
  }, []);

  useEffect(() => { void load(); }, [load]);

  const clientNamesMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients]);

  // Fecha actual con formato estilizado para el reporte
  const formattedReportDate = useMemo(() => {
    return new Date().toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  // 1. Filtrado dinámico de tareas según el rango seleccionado
  const filteredTasks = useMemo(() => {
    if (filterMode === 'all') return tasks;
    
    const now = new Date();
    return tasks.filter((task) => {
      const taskDate = new Date(task.created_at);
      if (isNaN(taskDate.getTime())) return true;

      if (filterMode === 'today') {
        return taskDate.toDateString() === now.toDateString();
      }
      if (filterMode === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        return taskDate >= weekAgo;
      }
      if (filterMode === 'month') {
        return taskDate.getMonth() === now.getMonth() && taskDate.getFullYear() === now.getFullYear();
      }
      if (filterMode === 'custom' && startDate && endDate) {
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59');
        return taskDate >= start && taskDate <= end;
      }
      return true;
    });
  }, [tasks, filterMode, startDate, endDate]);

  // 2. Filtrado dinámico de registros de tiempo
  const filteredEntries = useMemo(() => {
    if (filterMode === 'all') return entries;

    const now = new Date();
    return entries.filter((entry) => {
      const rawDate = entry.start_time || entry.created_at;
      if (!rawDate) return false;

      const entryDate = new Date(rawDate);
      if (isNaN(entryDate.getTime())) return false;

      if (filterMode === 'today') {
        return entryDate.toDateString() === now.toDateString();
      }
      if (filterMode === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        return entryDate >= weekAgo;
      }
      if (filterMode === 'month') {
        return entryDate.getMonth() === now.getMonth() && entryDate.getFullYear() === now.getFullYear();
      }
      if (filterMode === 'custom' && startDate && endDate) {
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59');
        return entryDate >= start && entryDate <= end;
      }
      return true;
    });
  }, [entries, filterMode, startDate, endDate]);

  // Cálculos desglosados basados en los datos filtrados
  const totalTasks = filteredTasks.length;
  const completedTasks = filteredTasks.filter((task) => {
    const st = String(task.status).toLowerCase();
    return st === 'completed' || st === 'completada';
  }).length;

  const inProgressTasks = filteredTasks.filter((task) => {
    const st = String(task.status).toLowerCase();
    return st === 'in_progress' || st === 'en proceso';
  }).length;

  const inReviewTasks = filteredTasks.filter((task) => {
    const st = String(task.status).toLowerCase();
    return st === 'in_review' || st === 'review' || st === 'en revisión';
  }).length;

  const pendingTasks = filteredTasks.filter((task) => {
    const st = String(task.status).toLowerCase();
    return st !== 'completed' && st !== 'completada' && st !== 'in_progress' && st !== 'en proceso' && st !== 'in_review' && st !== 'review' && st !== 'en revisión';
  }).length;

  const totalMinutes = filteredEntries.reduce((sum, entry) => sum + (Number(entry.duration_minutes) || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  // Agrupación de tiempo por cliente para analítica de rentabilidad (Top 3)
  const hoursPerClient = useMemo(() => {
    const map: Record<string, number> = {};
    filteredEntries.forEach((e) => {
      if (e.client_id) {
        map[e.client_id] = (map[e.client_id] || 0) + (Number(e.duration_minutes) || 0);
      }
    });
    return Object.entries(map)
      .map(([clientId, minutes]) => ({
        name: clientNamesMap[clientId] || 'Cliente general',
        hours: Number((minutes / 60).toFixed(1)),
        minutes,
      }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 3);
  }, [filteredEntries, clientNamesMap]);

  const maxClientHours = useMemo(() => {
    if (hoursPerClient.length === 0) return 1;
    const max = Math.max(...hoursPerClient.map(c => c.hours));
    return max === 0 ? 1 : max;
  }, [hoursPerClient]);

  // Función para exportar reporte en PDF
  const handleExportPDF = () => {
    window.print();
  };

  return (
    <DashboardShell title="Rendimiento y Métricas">
      {/* Estilos CSS avanzados para impresión: Forzar 1 sola página, ocultar localhost y estilizar modo claro/oscuro */}
      <style>{`
        @media print {
          @page {
            size: letter portrait;
            margin: 8mm;
          }
          body {
            background-color: #ffffff !important;
            color: #0f172a !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            zoom: 0.78; /* Escala precisa para que todo encaje en 1 sola hoja */
          }
          button, .no-print {
            display: none !important;
          }
          .print-header {
            display: flex !important;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 8px;
            margin-bottom: 16px;
          }
          .rounded-2xl, .rounded-xl {
            border: 1px solid #cbd5e1 !important;
            box-shadow: none !important;
            background-color: #ffffff !important;
          }
        }
        .print-header {
          display: none;
        }
      `}</style>

      {/* Encabezado elegante exclusivo para el reporte PDF */}
      <div className="print-header">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Téllez Ponce & Asociados</h1>
          <p className="text-xs text-slate-500">Reporte Ejecutivo de Rendimiento y Operación</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-slate-700 capitalize">{formattedReportDate}</p>
          <p className="text-[10px] text-slate-400">Sistema de Control Interno</p>
        </div>
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">No se pudieron cargar todos los datos: {error}</p>}

      {/* Barra superior con Filtro de Fechas y Botón de Exportar PDF */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Filtrar métricas y rendimiento</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Selecciona un rango de tiempo para auditar la operación del despacho.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setFilterMode('today')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filterMode === 'today' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>Hoy</button>
            <button type="button" onClick={() => setFilterMode('week')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filterMode === 'week' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>Última semana</button>
            <button type="button" onClick={() => setFilterMode('month')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filterMode === 'month' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>Este mes</button>
            <button type="button" onClick={() => setFilterMode('all')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filterMode === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>Histórico</button>
            <button type="button" onClick={() => setFilterMode('custom')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filterMode === 'custom' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}>Personalizado</button>
          </div>

          <button 
            type="button" 
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-900 shadow-sm hover:bg-slate-800 dark:hover:bg-white transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Exportar PDF
          </button>
        </div>

        {filterMode === 'custom' && (
          <div className="w-full flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <label className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">Desde: <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded border border-slate-300 dark:border-slate-700 bg-transparent p-1 text-slate-800 dark:text-slate-100" /></label>
            <label className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">Hasta: <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded border border-slate-300 dark:border-slate-700 bg-transparent p-1 text-slate-800 dark:text-slate-100" /></label>
          </div>
        )}
      </div>

      {/* Tarjetas de KPIs Estratégicos */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tiempo Invertido</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{totalHours} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">hrs</span></p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cartera de Clientes</p>
          <p className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">{clients.length} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">cuentas</span></p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Completadas</p>
          <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completedTasks}</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">En Proceso</p>
          <p className="mt-2 text-2xl font-bold text-blue-500 dark:text-blue-400">{inProgressTasks}</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">En Revisión</p>
          <p className="mt-2 text-2xl font-bold text-purple-600 dark:text-purple-400">{inReviewTasks}</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pendientes</p>
          <p className="mt-2 text-2xl font-bold text-amber-500 dark:text-amber-400">{pendingTasks}</p>
        </div>
      </div>

      {/* Gráficas Simétricas Principales */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        
        {/* Gráfica de Barras 1: Distribución Operativa de Tareas */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-colors">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Gráfica de Carga de Tareas</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Volumen de actividades por estatus operativo.</p>
          </div>
          
          <div className="my-6 flex items-end justify-around h-44 px-2 pt-6 border-b border-l border-slate-200 dark:border-slate-800 relative">
            <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-slate-400 pr-2 pointer-events-none">
              <span>{totalTasks}</span>
              <span>{Math.round(totalTasks / 2)}</span>
              <span>0</span>
            </div>

            {/* Completadas */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-[60px] h-full justify-end">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{completedTasks}</span>
              <div 
                className="w-full bg-emerald-500 rounded-t-lg transition-all duration-500 shadow-sm"
                style={{ height: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%`, minHeight: completedTasks > 0 ? '12px' : '4px' }}
              ></div>
              <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 text-center truncate w-full">Completadas</span>
            </div>

            {/* En Proceso */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-[60px] h-full justify-end">
              <span className="text-xs font-bold text-blue-500 dark:text-blue-400">{inProgressTasks}</span>
              <div 
                className="w-full bg-blue-500 rounded-t-lg transition-all duration-500 shadow-sm"
                style={{ height: `${totalTasks > 0 ? (inProgressTasks / totalTasks) * 100 : 0}%`, minHeight: inProgressTasks > 0 ? '12px' : '4px' }}
              ></div>
              <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 text-center truncate w-full">En Proceso</span>
            </div>

            {/* En Revisión */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-[60px] h-full justify-end">
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400">{inReviewTasks}</span>
              <div 
                className="w-full bg-purple-600 rounded-t-lg transition-all duration-500 shadow-sm"
                style={{ height: `${totalTasks > 0 ? (inReviewTasks / totalTasks) * 100 : 0}%`, minHeight: inReviewTasks > 0 ? '12px' : '4px' }}
              ></div>
              <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 text-center truncate w-full">En Revisión</span>
            </div>

            {/* Pendientes */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-[60px] h-full justify-end">
              <span className="text-xs font-bold text-amber-500 dark:text-amber-400">{pendingTasks}</span>
              <div 
                className="w-full bg-amber-500 rounded-t-lg transition-all duration-500 shadow-sm"
                style={{ height: `${totalTasks > 0 ? (pendingTasks / totalTasks) * 100 : 0}%`, minHeight: pendingTasks > 0 ? '12px' : '4px' }}
              ></div>
              <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 text-center truncate w-full">Pendientes</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 italic">Representación gráfica de volúmenes de trabajo en el periodo.</p>
        </div>

        {/* Gráfica de Barras 2: Analítica de Costo por Cliente (Top 3) */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-colors">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Analítica de Costo por Cliente (Top 3)</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Comparativa de horas acumuladas por cuenta.</p>
          </div>

          <div className="my-5 space-y-4">
            {hoursPerClient.length === 0 ? (
              <p className="text-xs text-slate-400 py-10 text-center">No hay registros de tiempo en este periodo.</p>
            ) : (
              hoursPerClient.map((item, idx) => {
                const barWidthPercentage = Math.round((item.hours / maxClientHours) * 100);
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <span className="truncate max-w-[180px]">{item.name}</span>
                      <span className="text-blue-600 dark:text-blue-400 font-bold">{item.hours} hrs</span>
                    </div>
                    <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden p-0.5">
                      <div 
                        className="h-full bg-blue-600 dark:bg-blue-500 rounded transition-all duration-500" 
                        style={{ width: `${Math.max(barWidthPercentage, 4)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <p className="text-[11px] text-slate-400 italic">Evaluación de rentabilidad y consumo de recursos por cuenta.</p>
        </div>

      </div>

      {/* Sección Inferior con los 4 indicadores operacionales completos */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Resumen de Eficiencia y Supervisión Fiscal</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Indicadores globales desglosados sobre el estado de la operación del despacho en el periodo.</p>
        
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Tasa de Conclusión</p>
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2">
              {totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%
            </p>
            <p className="text-[11px] text-slate-400 mt-1">{completedTasks} de {totalTasks} tareas concluidas.</p>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">En Proceso</p>
            <p className="text-2xl font-extrabold text-blue-500 dark:text-blue-400 mt-2">
              {inProgressTasks} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">tareas</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Actividades en desarrollo activo.</p>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">En Revisión</p>
            <p className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-2">
              {inReviewTasks} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">tareas</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Actividades listas para validación.</p>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Pendientes</p>
            <p className="text-2xl font-extrabold text-amber-500 dark:text-amber-400 mt-2">
              {pendingTasks} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">tareas</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Tareas por iniciar o sin atender.</p>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}