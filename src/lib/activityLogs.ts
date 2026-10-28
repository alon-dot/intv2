import { supabase } from './supabaseClient';

export type ActivityAction = 'client_created' | 'task_assigned' | 'task_status_changed' | 'task_completed';

export async function logActivity(userId: string | null | undefined, actionType: ActivityAction, description: string) {
  if (!userId) return;

  const { error } = await supabase.from('activity_logs').insert({
    user_id: userId,
    action_type: actionType,
    description,
    created_at: new Date().toISOString(),
  });

  if (error) console.error('No se pudo registrar la actividad:', error.message);
}

export async function logTaskStatusChange(userId: string | null | undefined, title: string, previousStatus: string, nextStatus: string) {
  if (previousStatus.toLowerCase() === nextStatus.toLowerCase()) return;
  if (nextStatus.toLowerCase() === 'completed') {
    await logActivity(userId, 'task_completed', `Completó la tarea: ${title}`);
    return;
  }
  const statusLabels: Record<string, string> = { pending: 'Pendiente', in_progress: 'En proceso', review: 'En revisión' };
  await logActivity(userId, 'task_status_changed', `Cambió el estado de la tarea ${title} a ${statusLabels[nextStatus.toLowerCase()] ?? nextStatus}`);
}
