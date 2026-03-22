// TypeScript ORM Type Definitions for KAN-14 Reports & Audit

export enum ReportStatus {
  GENERATING = 'generating',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum ReportType {
  COMPLIANCE = 'compliance',
  RISK = 'risk',
  BIAS = 'bias',
  MODEL_EVAL = 'model_eval'
}

export enum ActionType {
  CREATE_REPORT = 'CREATE_REPORT',
  DELETE_REPORT = 'DELETE_REPORT',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  CREATE_API_KEY = 'CREATE_API_KEY',
  REVOKE_API_KEY = 'REVOKE_API_KEY',
  TRUST_EVALUATION = 'TRUST_EVALUATION'
}

export interface TrustReport {
  id: string;
  user_id: string;
  title?: string;
  description?: string;
  report_type: ReportType;
  status: ReportStatus;
  input_payload?: Record<string, any>;
  output_summary?: string;
  output_full_report?: Record<string, any>;
  storage_path?: string;
  checksum_hash?: string;
  version: number;
  deleted_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface AuditTrail {
  id: string;
  user_id?: string;
  action_type: ActionType;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

export interface DeletionLog {
  id: string;
  report_id?: string;
  user_id?: string;
  deletion_type: 'soft' | 'hard';
  reason?: string;
  metadata?: Record<string, any>;
  created_at: Date;
}

// Request/Response DTOs
export interface CreateReportRequest {
  title?: string;
  description?: string;
  report_type: ReportType;
  input_payload?: Record<string, any>;
}

export interface UpdateReportRequest {
  title?: string;
  description?: string;
  status?: ReportStatus;
  output_summary?: string;
  output_full_report?: Record<string, any>;
}

export interface CreateAuditRequest {
  action_type: ActionType;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}
