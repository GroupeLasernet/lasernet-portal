// ============================================================
// Shared API Types — Atelier DSM Unified Platform
// These types define the contracts between the portal and
// the robot/relfar microservices.
// ============================================================

// ---- Robot Service Types (Elfin Cobot Studio, port 8080) ----

export interface RobotState {
  joint_positions: number[];      // 6 joint angles in degrees
  cartesian_position: number[];   // [X, Y, Z, Rx, Ry, Rz] in mm/degrees
  servo_enabled: boolean;
  is_moving: boolean;
  has_error: boolean;
  simulation_mode: boolean;
  connected: boolean;
}

export interface RobotDiagnostic {
  fsm_state: number;
  fsm_name: string;
  robot_state: any;
  connected: boolean;
  simulation_mode: boolean;
}

export interface RobotConnectRequest {
  ip: string;
  port: number;
}

export interface RobotConnectResponse {
  connected: boolean;
  simulation_mode: boolean;
  message: string;
}

export interface RobotJogRequest {
  axis: 'x' | 'y' | 'z' | 'rx' | 'ry' | 'rz';
  distance: number;
  speed: number;
}

export interface RobotJogJointRequest {
  joint: 1 | 2 | 3 | 4 | 5 | 6;
  distance: number;
  speed: number;
}

export interface RobotProgram {
  id: number;
  name: string;
  speed: number;
  waypoints: RobotWaypoint[];
  waypoint_count: number;
  status: 'ready' | 'running' | 'paused' | 'done' | 'error';
  estimated_distance_mm: number;
  estimated_time_s: number;
}

export interface RobotWaypoint {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  type: 'move' | 'trace';
}

export interface RobotSettings {
  robot_ip: string;
  robot_port: number;
  speed: number;
  acceleration: number;
  blend_radius: number;
  origin_x: number;
  origin_y: number;
  origin_z: number;
  orientation_rx: number;
  orientation_ry: number;
  orientation_rz: number;
  approach_height: number;
}

// ---- Relfar Laser Service Types (port 5000) ----

export interface RelfarStatus {
  connected: boolean;
  port: string;
  baud_rate: number | null;
  slave_id: number | null;
  parity: string;
  rs485_mode: 'normal' | 'inverted';
  scan_in_progress: boolean;
  last_read_time: string | null;
  error: string | null;
  connection_settings: RelfarConnectionSettings | null;
  registers: Record<string, number>;
}

export interface RelfarConnectionSettings {
  baud_rate: number;
  parity: string;
  slave_id: number;
  register_type: string;
  register_start: number;
  rs485_mode: string;
}

export interface RelfarConnectRequest {
  port: string;
  baud_rate: number;
  parity: string;
  slave_id: number;
  rs485_mode?: string;
}

export interface RelfarScanRequest {
  port: string;
  quick?: boolean;
  rs485_mode?: 'normal' | 'inverted' | 'both';
}

export interface RelfarReadRequest {
  address: number;
  count: number;
  type: 'holding' | 'input';
}

export interface RelfarWriteRequest {
  address: number;
  values: number[];
}

export interface RelfarRegisterData {
  registers: Record<string, number>;
  address_start: number;
  count: number;
  type: string;
  timestamp: string;
}

// ---- Job Types (managed in portal, references both services) ----

export type MachineType = 'robot' | 'laser' | 'robot_and_laser';
export type JobStatus = 'draft' | 'in_progress' | 'testing' | 'completed' | 'archived';
export type ProgramStatus = 'development' | 'testing' | 'production' | 'archived';

export interface Job {
  id: string;
  jobNumber: string;
  managedClientId: string;
  title: string;
  notes?: string;
  status: JobStatus;
  machineType: MachineType;
  robotModel?: string;
  laserModel?: string;
  robotSerialNumber?: string;
  laserSerialNumber?: string;
  createdAt: string;
  updatedAt: string;
  invoices: JobInvoice[];
  robotPrograms: JobRobotProgram[];
  laserPresets: JobLaserPreset[];
}

export interface JobInvoice {
  id: string;
  jobId: string;
  qbInvoiceId: string;
  invoiceNumber: string;
  invoiceType: 'robot' | 'laser' | 'general' | 'service';
  amount?: number;
  linkedAt: string;
}

export interface JobRobotProgram {
  id: string;
  jobId: string;
  name: string;
  description?: string;
  status: ProgramStatus;
  dxfFilename?: string;
  waypoints?: RobotWaypoint[];
  speed: number;
  acceleration: number;
  blendRadius: number;
  originX: number;
  originY: number;
  originZ: number;
  orientationRx: number;
  orientationRy: number;
  orientationRz: number;
  approachHeight: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface JobLaserPreset {
  id: string;
  jobId: string;
  name: string;
  description?: string;
  status: ProgramStatus;
  registers: Record<string, number>;
  port?: string;
  baudRate?: number;
  parity?: string;
  slaveId?: number;
  rs485Mode: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

// ---- Service Health ----

export interface ServiceHealth {
  service: 'robot' | 'relfar';
  reachable: boolean;
  lastChecked: string;
  error?: string;
}
