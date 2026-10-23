export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'ACCOUNTANT';

// Legacy role values are still stored by the current application.
export type AppRole = 'admin' | 'supervisor' | 'contador';

// Supabase client schema typing is completed as the database schema is migrated.
export type Database = any;

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  hourly_rate: number; // Tarifa por hora para cálculo de cobro
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  tax_id?: string;
  tax_regime?: string;
  contact_email?: string;
  phone?: string;
  created_at: string;
}

export interface Project {
  id: string;
  client_id: string;
  name: string;
  description?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  created_at: string;
  client?: Client; // Para JOINs
}

export interface TaskCategory {
  id: string;
  name: string;
}

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED';

export interface Task {
  id: string;
  project_id: string;
  category_id?: string;
  title: string;
  description?: string;
  assigned_to?: string;
  estimated_hours: number;
  due_date: string; // YYYY-MM-DD
  status: TaskStatus;
  created_at: string;
  // Propiedades opcionales traídas con JOINs
  project?: Project;
  category?: TaskCategory;
  assignee?: Profile;
}

export interface TimeEntry {
  id: string;
  task_id: string;
  user_id: string;
  start_time?: string;
  end_time?: string;
  duration_minutes: number;
  is_manual: boolean;
  justification?: string;
  created_at: string;
  // Propiedades opcionales traídas con JOINs
  task?: Task;
  user?: Profile;
}
