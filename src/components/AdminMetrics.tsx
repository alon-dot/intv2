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
  assigned_accountant_id?: string;
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

  // Estados para filtros específicos (Múltiples selecciones mediante IDs)
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedAccountants, setSelectedAccountants] = useState<string[]>([]);
  const [selectedSupervisors, setSelectedSupervisors] = useState<string[]>([]);

  // Estados para colapsar/expandir los paneles de filtros avanzados
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  const load = useCallback(async () => {
    const [profileResult, taskResult, entryResult, clientResult] = await Promise.all([
      supabase.from('profiles').select('id,full_name,role,supervisor_id').order('full_name'),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('time_entries').select('duration_minutes,client_id,user_id,created_at,start_time'),
      supabase.from('clients').select('id,name,assigned_accountant_id'),
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
  
  const accountants = useMemo(() => profiles.filter(p => p.role === 'contador'), [profiles]);
  const supervisors = useMemo(() => profiles.filter(p => p.role === 'supervisor' || p.role === 'admin'), [profiles]);

  const profileMap = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, p])), [profiles]);

  // Textos para el reporte PDF
  const selectedClientNames = useMemo(() => {
    if (selectedClients.length === 0) return 'Todos los clientes (Cartera General)';
    return selectedClients.map(id => clientNamesMap[id]).filter(Boolean).join(', ');
  }, [selectedClients, clientNamesMap]);

  const selectedAccountantNames = useMemo(() => {
    if (selectedAccountants.length === 0) return 'Todos los contadores';
    return selectedAccountants.map(id => profileMap[id]?.full_name || profileMap[id]?.email).filter(Boolean).join(', ');
  }, [selectedAccountants, profileMap]);

  const selectedSupervisorNames = useMemo(() => {
    if (selectedSupervisors.length === 0) return 'Todos los supervisores';
    return selectedSupervisors.map(id => profileMap[id]?.full_name || profileMap[id]?.email).filter(Boolean).join(', ');
  }, [selectedSupervisors, profileMap]);

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

  // 1. Filtrado dinámico de tareas
  const filteredTasks = useMemo(() => {
    const now = new Date();
    return tasks.filter((task) => {
      if (selectedClients.length > 0) {
        if (!task.client_id || !selectedClients.includes(task.client_id)) return false;
      }

      if (selectedAccountants.length > 0) {
        if (!task.assigned_to || !selectedAccountants.includes(task.assigned_to)) return false;
      }

      if (selectedSupervisors.length > 0) {
        const assignedUser = task.assigned_to ? profileMap[task.assigned_to] : null;
        const supervisorId = assignedUser?.supervisor_id;
        const isCreatedBySupervisor = task.created_by && selectedSupervisors.includes(task.created_by);
        const isAssignedSupervisor = supervisorId && selectedSupervisors.includes(supervisorId);
        
        if (!isCreatedBySupervisor && !isAssignedSupervisor) return false;
      }

      if (filterMode === 'all') return true;
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
  }, [tasks, filterMode, startDate, endDate, selectedClients, selectedAccountants, selectedSupervisors, profileMap]);

  // 2. Filtrado dinámico de registros de tiempo
  const filteredEntries = useMemo(() => {
    const now = new Date();
    return entries.filter((entry) => {
      if (selectedClients.length > 0) {
        if (!entry.client_id || !selectedClients.includes(entry.client_id)) return false;
      }

      if (selectedAccountants.length > 0) {
        if (!entry.user_id || !selectedAccountants.includes(entry.user_id)) return false;
      }

      if (selectedSupervisors.length > 0) {
        const entryUser = entry.user_id ? profileMap[entry.user_id] : null;
        const supervisorId = entryUser?.supervisor_id;
        if (!supervisorId || !selectedSupervisors.includes(supervisorId)) return false;
      }

      if (filterMode === 'all') return true;

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
  }, [entries, filterMode, startDate, endDate, selectedClients, selectedAccountants, selectedSupervisors, profileMap]);

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

  const toggleSelection = (id: string, list: string[], setList: (val: string[]) => void) => {
    if (list.includes(id)) {
      setList(list.filter(item => item !== id));
    } else {
      setList([...list, id]);
    }
  };

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <DashboardShell title="Rendimiento y Métricas">
      <div className="print-report">
      <style>{`
        @media print {
          @page {
            size: auto;
            margin: 0mm;
          }
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            background-color: #ffffff !important;
            color: #0f172a !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .min-h-screen {
            display: block !important;
            min-height: 0 !important;
            background: #ffffff !important;
          }
          .min-h-screen > div:first-child,
          aside,
          header:not(.print-header) {
            display: none !important;
          }
          main {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-report {
            box-sizing: border-box !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 10mm !important;
            font-size: 11pt !important;
          }
          .print-header > div:first-child {
            display: flex !important;
            width: 100% !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 12px !important;
          }
          .print-header > div:first-child > div:first-child {
            display: flex !important;
            min-width: 0 !important;
            flex: 1 1 auto !important;
            align-items: center !important;
            gap: 12px !important;
          }
          .print-header img {
            display: block !important;
            width: 82px !important;
            height: 58px !important;
            flex: 0 0 82px !important;
            object-fit: contain !important;
          }
          .print-header > div:first-child > div:last-child {
            flex: 0 0 auto !important;
            margin-left: auto !important;
          }
          .print-report .text-xs {
            font-size: 10pt !important;
            line-height: 1.35 !important;
          }
          .print-report .text-sm {
            font-size: 11pt !important;
            line-height: 1.4 !important;
          }
          .print-report [class*="text-[10px]"] {
            font-size: 9pt !important;
          }
          .print-report [class*="text-[11px]"] {
            font-size: 9.5pt !important;
          }
          button, .no-print {
            display: none !important;
          }
          .print-header {
            display: block !important;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .print-meta-box {
            background-color: #f8fafc !important;
            border: 1px solid #cbd5e1 !important;
            padding: 8px 12px !important;
            border-radius: 6px;
            margin-top: 8px;
            font-size: 10px;
          }
          .rounded-2xl, .rounded-xl {
            border: 1px solid #cbd5e1 !important;
            box-shadow: none !important;
            background-color: #ffffff !important;
            margin-bottom: 5px !important;
          }
          .mb-6 {
            margin-bottom: 6px !important;
          }
          .p-6, .p-5, .p-4 {
            padding: 8px !important;
          }
          .print-report .gap-6 {
            gap: 8px !important;
          }
          .print-report .gap-4 {
            gap: 6px !important;
          }
          .print-report .my-4 {
            margin-top: 6px !important;
            margin-bottom: 6px !important;
          }
          .print-report .mt-4 {
            margin-top: 6px !important;
          }
          .print-header {
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 6px !important;
            padding-bottom: 5px !important;
          }
          .print-meta-box {
            padding: 5px 8px !important;
            margin-top: 5px !important;
          }
          .print-report > .mb-6,
          .print-report > .rounded-2xl {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
        .print-header {
          display: none;
        }
      `}</style>

      {/* Encabezado y Ficha de Datos del Reporte PDF en 3 columnas sin checkboxes */}
      <div className="print-header">
        <div className="flex items-center justify-between">
          <div>
            <img src="/Telles%20Ponce%20Blanco.svg" alt="Logo Téllez Ponce & Asociados" />
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">Téllez Ponce & Asociados</h1>
            <p className="text-[11px] text-slate-600 font-medium">Reporte Ejecutivo de Rendimiento, Operación y Supervisión</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-800 capitalize">{formattedReportDate}</p>
            <p className="text-[10px] text-slate-500">Sistema de Control Interno</p>
          </div>
        </div>

        <div className="print-meta-box grid grid-cols-3 gap-3 text-slate-700 text-[10px]">
          <div>
            <strong className="text-slate-900 uppercase block mb-0.5">Clientes:</strong>
            <span>{selectedClientNames}</span>
          </div>
          <div>
            <strong className="text-slate-900 uppercase block mb-0.5">Contadores:</strong>
            <span>{selectedAccountantNames}</span>
          </div>
          <div>
            <strong className="text-slate-900 uppercase block mb-0.5">Supervisores:</strong>
            <span>{selectedSupervisorNames}</span>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">No se pudieron cargar todos los datos: {error}</p>}

      {/* Barra superior con Filtro de Fechas y Botón de Exportar PDF */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Filtrar métricas y rendimiento</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Selecciona rangos de tiempo y segmenta por clientes, contadores o supervisores.</p>
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

      {/* Panel Desplegable de Filtros Avanzados por Checkbox */}
      <div className="no-print mb-6 rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Filtros Específicos (Clientes, Contadores y Supervisores)</span>
              {(selectedClients.length > 0 || selectedAccountants.length > 0 || selectedSupervisors.length > 0) && (
                <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                  Activos ({selectedClients.length + selectedAccountants.length + selectedSupervisors.length})
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Selecciona contadores, supervisores y clientes para desglosar la información.</p>
          </div>
          <button type="button" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            {showAdvancedFilters ? 'Ocultar filtros ▲' : 'Mostrar filtros ▼'}
          </button>
        </div>

        {showAdvancedFilters && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid gap-6 md:grid-cols-3">
            
            {/* Clientes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Clientes</span>
                {selectedClients.length > 0 && (
                  <button onClick={() => setSelectedClients([])} className="text-[10px] text-blue-500 hover:underline">Limpiar</button>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-2 border border-slate-100 dark:border-slate-800 rounded-lg p-2 bg-slate-50 dark:bg-slate-800/30">
                {clients.map(client => (
                  <label key={client.id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer hover:text-slate-900">
                    <input 
                      type="checkbox" 
                      checked={selectedClients.includes(client.id)}
                      onChange={() => toggleSelection(client.id, selectedClients, setSelectedClients)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                    />
                    <span className="truncate">{client.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Contadores */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Contadores</span>
                {selectedAccountants.length > 0 && (
                  <button onClick={() => setSelectedAccountants([])} className="text-[10px] text-blue-500 hover:underline">Limpiar</button>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-2 border border-slate-100 dark:border-slate-800 rounded-lg p-2 bg-slate-50 dark:bg-slate-800/30">
                {accountants.map(acc => (
                  <label key={acc.id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer hover:text-slate-900">
                    <input 
                      type="checkbox" 
                      checked={selectedAccountants.includes(acc.id)}
                      onChange={() => toggleSelection(acc.id, selectedAccountants, setSelectedAccountants)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                    />
                    <span className="truncate">{acc.full_name || acc.email}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Supervisores */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Supervisores</span>
                {selectedSupervisors.length > 0 && (
                  <button onClick={() => setSelectedSupervisors([])} className="text-[10px] text-blue-500 hover:underline">Limpiar</button>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-2 border border-slate-100 dark:border-slate-800 rounded-lg p-2 bg-slate-50 dark:bg-slate-800/30">
                {supervisors.map(sup => (
                  <label key={sup.id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer hover:text-slate-900">
                    <input 
                      type="checkbox" 
                      checked={selectedSupervisors.includes(sup.id)}
                      onChange={() => toggleSelection(sup.id, selectedSupervisors, setSelectedSupervisors)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                    />
                    <span className="truncate">{sup.full_name || sup.email}</span>
                  </label>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tiempo Invertido</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{totalHours} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">hrs</span></p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cartera de Clientes</p>
          <p className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">{selectedClients.length > 0 ? selectedClients.length : clients.length} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">cuentas</span></p>
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

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-colors">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Gráfica de Carga de Tareas</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Volumen de actividades por estatus operativo según filtros aplicados.</p>
          </div>
          
          <div className="my-4 flex items-end justify-around h-36 px-2 pt-6 border-b border-l border-slate-200 dark:border-slate-800 relative">
            <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-slate-400 pr-2 pointer-events-none">
              <span>{totalTasks}</span>
              <span>{Math.round(totalTasks / 2)}</span>
              <span>0</span>
            </div>

            <div className="flex flex-col items-center gap-2 flex-1 max-w-[60px] h-full justify-end">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{completedTasks}</span>
              <div 
                className="w-full bg-emerald-500 rounded-t-lg transition-all duration-500 shadow-sm"
                style={{ height: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%`, minHeight: completedTasks > 0 ? '12px' : '4px' }}
              ></div>
              <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 text-center truncate w-full">Completadas</span>
            </div>

            <div className="flex flex-col items-center gap-2 flex-1 max-w-[60px] h-full justify-end">
              <span className="text-xs font-bold text-blue-500 dark:text-blue-400">{inProgressTasks}</span>
              <div 
                className="w-full bg-blue-500 rounded-t-lg transition-all duration-500 shadow-sm"
                style={{ height: `${totalTasks > 0 ? (inProgressTasks / totalTasks) * 100 : 0}%`, minHeight: inProgressTasks > 0 ? '12px' : '4px' }}
              ></div>
              <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 text-center truncate w-full">En Proceso</span>
            </div>

            <div className="flex flex-col items-center gap-2 flex-1 max-w-[60px] h-full justify-end">
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400">{inReviewTasks}</span>
              <div 
                className="w-full bg-purple-600 rounded-t-lg transition-all duration-500 shadow-sm"
                style={{ height: `${totalTasks > 0 ? (inReviewTasks / totalTasks) * 100 : 0}%`, minHeight: inReviewTasks > 0 ? '12px' : '4px' }}
              ></div>
              <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 text-center truncate w-full">En Revisión</span>
            </div>

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

        <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-colors">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Analítica de Costo por Cliente</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Comparativa de horas acumuladas por cuenta.</p>
          </div>

          <div className="my-4 space-y-3">
            {hoursPerClient.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No hay registros de tiempo en este periodo o filtro.</p>
            ) : (
              hoursPerClient.map((item, idx) => {
                const barWidthPercentage = Math.round((item.hours / maxClientHours) * 100);
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <span className="truncate max-w-[180px]">{item.name}</span>
                      <span className="text-blue-600 dark:text-blue-400 font-bold">{item.hours} hrs</span>
                    </div>
                    <div className="h-3.5 w-full bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden p-0.5">
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
          <p className="text-[11px] text-slate-400 italic">Evaluación de rentabilidad y consumo de recursos por cliente.</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Resumen de Eficiencia y Supervisión Fiscal</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Indicadores globales desglosados sobre el estado de la operación del despacho en el periodo.</p>
        
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3.5 border border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Tasa de Conclusión</p>
            <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1.5">
              {totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">{completedTasks} de {totalTasks} tareas concluidas.</p>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3.5 border border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">En Proceso</p>
            <p className="text-xl font-extrabold text-blue-500 dark:text-blue-400 mt-1.5">
              {inProgressTasks}
            </p>
          </div>
        </div>
      </div>
      </div>
    </DashboardShell>
  );
}
