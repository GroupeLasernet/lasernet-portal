/**
 * Service Communication Layer
 * Proxies requests from the portal to the robot and relfar microservices.
 * Each service runs independently and is reached via HTTP.
 */

const ROBOT_URL = process.env.ROBOT_SERVICE_URL || 'http://localhost:8080';
const RELFAR_URL = process.env.RELFAR_SERVICE_URL || 'http://localhost:5000';

interface ServiceResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
}

async function serviceRequest<T>(baseUrl: string, path: string, options?: RequestInit): Promise<ServiceResponse<T>> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    const data = await res.json();
    return { ok: res.ok, data, status: res.status };
  } catch (error: any) {
    return { ok: false, error: error.message || 'Service unreachable', status: 0 };
  }
}

// ---- Robot Service ----
export const robot = {
  getState: () => serviceRequest(ROBOT_URL, '/api/robot/state'),
  getDiag: () => serviceRequest(ROBOT_URL, '/api/robot/diag'),
  connect: (ip: string, port: number) =>
    serviceRequest(ROBOT_URL, '/api/robot/connect', {
      method: 'POST',
      body: new URLSearchParams({ ip, port: String(port) }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  disconnect: () => serviceRequest(ROBOT_URL, '/api/robot/disconnect', { method: 'POST' }),
  enable: () => serviceRequest(ROBOT_URL, '/api/robot/enable', { method: 'POST' }),
  disable: () => serviceRequest(ROBOT_URL, '/api/robot/disable', { method: 'POST' }),
  stop: () => serviceRequest(ROBOT_URL, '/api/robot/stop', { method: 'POST' }),
  clearAlarm: () => serviceRequest(ROBOT_URL, '/api/robot/clear-alarm', { method: 'POST' }),
  startup: () => serviceRequest(ROBOT_URL, '/api/robot/startup', { method: 'POST' }),
  jog: (axis: string, distance: number, speed: number) =>
    serviceRequest(ROBOT_URL, '/api/robot/jog', {
      method: 'POST',
      body: new URLSearchParams({ axis, distance: String(distance), speed: String(speed) }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  jogJoint: (joint: number, distance: number, speed: number) =>
    serviceRequest(ROBOT_URL, '/api/robot/jog-joint', {
      method: 'POST',
      body: new URLSearchParams({ joint: String(joint), distance: String(distance), speed: String(speed) }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  getSettings: () => serviceRequest(ROBOT_URL, '/api/settings'),
  updateSettings: (settings: Record<string, any>) =>
    serviceRequest(ROBOT_URL, '/api/settings', {
      method: 'POST',
      body: new URLSearchParams(Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, String(v)]))).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  getProjects: () => serviceRequest(ROBOT_URL, '/api/projects'),
  getPrograms: (projectId: number) => serviceRequest(ROBOT_URL, `/api/projects/${projectId}/programs`),
  getProgram: (id: number) => serviceRequest(ROBOT_URL, `/api/programs/${id}`),
  runProgram: (id: number) => serviceRequest(ROBOT_URL, `/api/robot/run-program/${id}`, { method: 'POST' }),
  // Health check
  health: async (): Promise<{ reachable: boolean; error?: string }> => {
    try {
      const res = await fetch(`${ROBOT_URL}/api/robot/state`, { signal: AbortSignal.timeout(3000) });
      return { reachable: res.ok };
    } catch (e: any) {
      return { reachable: false, error: e.message };
    }
  },
};

// ---- Relfar Laser Service ----
export const relfar = {
  getStatus: () => serviceRequest(RELFAR_URL, '/api/status'),
  getPorts: () => serviceRequest(RELFAR_URL, '/api/ports'),
  scan: (port: string, quick?: boolean, rs485Mode?: string) =>
    serviceRequest(RELFAR_URL, '/api/scan', {
      method: 'POST',
      body: JSON.stringify({ port, quick, rs485_mode: rs485Mode }),
    }),
  getScanResults: () => serviceRequest(RELFAR_URL, '/api/scan-results'),
  connect: (settings: { port: string; baud_rate: number; parity: string; slave_id: number; rs485_mode?: string }) =>
    serviceRequest(RELFAR_URL, '/api/connect', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),
  disconnect: () => serviceRequest(RELFAR_URL, '/api/disconnect', { method: 'POST' }),
  readRegisters: (address: number, count: number, type: string) =>
    serviceRequest(RELFAR_URL, '/api/read', {
      method: 'POST',
      body: JSON.stringify({ address, count, type }),
    }),
  writeRegisters: (address: number, values: number[]) =>
    serviceRequest(RELFAR_URL, '/api/write', {
      method: 'POST',
      body: JSON.stringify({ address, values }),
    }),
  setRs485Mode: (mode?: string) =>
    serviceRequest(RELFAR_URL, '/api/rs485-mode', {
      method: 'POST',
      body: JSON.stringify(mode ? { mode } : {}),
    }),
  health: async (): Promise<{ reachable: boolean; error?: string }> => {
    try {
      const res = await fetch(`${RELFAR_URL}/api/status`, { signal: AbortSignal.timeout(3000) });
      return { reachable: res.ok };
    } catch (e: any) {
      return { reachable: false, error: e.message };
    }
  },
};
