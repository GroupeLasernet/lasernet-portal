'use client';

import { useState, useEffect } from 'react';

interface RobotState {
  connected: boolean;
  simulating: boolean;
  servo_enabled: boolean;
  moving: boolean;
  error: string;
  joint_positions: number[];
  cartesian_position: {
    x: number;
    y: number;
    z: number;
    rx: number;
    ry: number;
    rz: number;
  };
}

interface RobotHealth {
  reachable: boolean;
  service?: string;
}

interface RelflarStatus {
  connected: boolean;
  port?: string;
  baudrate?: number;
  parity?: string;
  slave_id?: number;
  registers?: { address: number; value: number; hex: string }[];
  last_read?: string;
}

interface RelflarHealth {
  reachable: boolean;
  service?: string;
}

interface Job {
  id: string;
  name: string;
}

export default function MachinesDashboard() {
  // Robot state
  const [robotHealth, setRobotHealth] = useState<RobotHealth>({ reachable: false });
  const [robotState, setRobotState] = useState<RobotState>({
    connected: false,
    simulating: false,
    servo_enabled: false,
    moving: false,
    error: '',
    joint_positions: [0, 0, 0, 0, 0, 0],
    cartesian_position: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
  });
  const [robotIP, setRobotIP] = useState('192.168.1.100');
  const [robotPort, setRobotPort] = useState('19206');
  const [robotConnecting, setRobotConnecting] = useState(false);

  // Laser state
  const [laserHealth, setLaserHealth] = useState<RelflarHealth>({ reachable: false });
  const [laserStatus, setLaserStatus] = useState<RelflarStatus>({ connected: false });
  const [laserPorts, setLaserPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState('COM1');
  const [laserBaudRate, setLaserBaudRate] = useState('9600');
  const [laserParity, setLaserParity] = useState('N');
  const [laserSlaveID, setLaserSlaveID] = useState('1');
  const [laserConnecting, setLaserConnecting] = useState(false);

  // Jog controls
  const [jogSpeed, setJogSpeed] = useState(50);
  const [jogDistance, setJogDistance] = useState(10);

  // Register controls
  const [readRegAddr, setReadRegAddr] = useState('0');
  const [readRegCount, setReadRegCount] = useState('10');
  const [readRegType, setReadRegType] = useState('holding');
  const [writeRegAddr, setWriteRegAddr] = useState('0');
  const [writeRegValues, setWriteRegValues] = useState('0');

  // Job management
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch health status on mount and periodically
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/services/health');
        const health = await res.json();
        if (health.robot) setRobotHealth(health.robot);
        if (health.relfar) setLaserHealth(health.relfar);
      } catch (err) {
        console.error('Health check failed:', err);
      }
    };

    fetchHealth();
    const healthInterval = setInterval(fetchHealth, 5000);
    return () => clearInterval(healthInterval);
  }, []);

  // Fetch robot state every 1 second when connected
  useEffect(() => {
    if (!robotState.connected) return;

    const fetchRobotState = async () => {
      try {
        const res = await fetch('/api/services/robot/api/robot/state');
        if (res.ok) {
          const state = await res.json();
          setRobotState(state);
        }
      } catch (err) {
        console.error('Robot state fetch failed:', err);
      }
    };

    fetchRobotState();
    const robotInterval = setInterval(fetchRobotState, 1000);
    return () => clearInterval(robotInterval);
  }, [robotState.connected]);

  // Fetch laser status every 2 seconds when connected
  useEffect(() => {
    if (!laserStatus.connected) return;

    const fetchLaserStatus = async () => {
      try {
        const res = await fetch('/api/services/relfar/api/status');
        if (res.ok) {
          const status = await res.json();
          setLaserStatus(status);
        }
      } catch (err) {
        console.error('Laser status fetch failed:', err);
      }
    };

    fetchLaserStatus();
    const laserInterval = setInterval(fetchLaserStatus, 2000);
    return () => clearInterval(laserInterval);
  }, [laserStatus.connected]);

  // Fetch jobs on mount
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await fetch('/api/jobs');
        if (res.ok) {
          const data = await res.json();
          setJobs(data);
        }
      } catch (err) {
        console.error('Failed to fetch jobs:', err);
      }
    };

    fetchJobs();
  }, []);

  // Fetch laser ports when component mounts
  useEffect(() => {
    const fetchPorts = async () => {
      try {
        const res = await fetch('/api/services/relfar/api/ports');
        if (res.ok) {
          const ports = await res.json();
          setLaserPorts(ports);
          if (ports.length > 0 && !selectedPort) {
            setSelectedPort(ports[0]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch ports:', err);
      }
    };

    fetchPorts();
  }, []);

  // Robot actions
  const connectRobot = async () => {
    setRobotConnecting(true);
    try {
      const res = await fetch('/api/services/robot/api/robot/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: robotIP, port: parseInt(robotPort) }),
      });
      if (res.ok) {
        setRobotState((prev) => ({ ...prev, connected: true }));
      }
    } catch (err) {
      console.error('Robot connect failed:', err);
    }
    setRobotConnecting(false);
  };

  const disconnectRobot = async () => {
    try {
      await fetch('/api/services/robot/api/robot/disconnect', { method: 'POST' });
      setRobotState((prev) => ({ ...prev, connected: false }));
    } catch (err) {
      console.error('Robot disconnect failed:', err);
    }
  };

  const robotStartup = async () => {
    try {
      await fetch('/api/services/robot/api/robot/startup', { method: 'POST' });
    } catch (err) {
      console.error('Robot startup failed:', err);
    }
  };

  const robotEnable = async () => {
    try {
      await fetch('/api/services/robot/api/robot/enable', { method: 'POST' });
    } catch (err) {
      console.error('Robot enable failed:', err);
    }
  };

  const robotDisable = async () => {
    try {
      await fetch('/api/services/robot/api/robot/disable', { method: 'POST' });
    } catch (err) {
      console.error('Robot disable failed:', err);
    }
  };

  const robotStop = async () => {
    try {
      await fetch('/api/services/robot/api/robot/stop', { method: 'POST' });
    } catch (err) {
      console.error('Robot stop failed:', err);
    }
  };

  const robotClearAlarm = async () => {
    try {
      await fetch('/api/services/robot/api/robot/clear_alarm', { method: 'POST' });
    } catch (err) {
      console.error('Robot clear alarm failed:', err);
    }
  };

  const robotHome = async () => {
    try {
      await fetch('/api/services/robot/api/robot/home', { method: 'POST' });
    } catch (err) {
      console.error('Robot home failed:', err);
    }
  };

  const jogCartesian = async (axis: string, direction: number) => {
    try {
      await fetch('/api/services/robot/api/robot/jog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cartesian',
          axis,
          direction,
          distance: jogDistance,
          speed: jogSpeed,
        }),
      });
    } catch (err) {
      console.error('Jog failed:', err);
    }
  };

  const jogJoint = async (joint: number, direction: number) => {
    try {
      await fetch('/api/services/robot/api/robot/jog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'joint',
          joint,
          direction,
          distance: jogDistance,
          speed: jogSpeed,
        }),
      });
    } catch (err) {
      console.error('Jog failed:', err);
    }
  };

  // Laser actions
  const connectLaser = async () => {
    setLaserConnecting(true);
    try {
      const res = await fetch('/api/services/relfar/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          port: selectedPort,
          baudrate: parseInt(laserBaudRate),
          parity: laserParity,
          slave_id: parseInt(laserSlaveID),
        }),
      });
      if (res.ok) {
        setLaserStatus((prev) => ({ ...prev, connected: true }));
      }
    } catch (err) {
      console.error('Laser connect failed:', err);
    }
    setLaserConnecting(false);
  };

  const disconnectLaser = async () => {
    try {
      await fetch('/api/services/relfar/api/disconnect', { method: 'POST' });
      setLaserStatus((prev) => ({ ...prev, connected: false }));
    } catch (err) {
      console.error('Laser disconnect failed:', err);
    }
  };

  const readRegisters = async () => {
    try {
      const res = await fetch('/api/services/relfar/api/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: parseInt(readRegAddr),
          count: parseInt(readRegCount),
          type: readRegType,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLaserStatus((prev) => ({
          ...prev,
          registers: data.registers,
          last_read: new Date().toLocaleTimeString(),
        }));
      }
    } catch (err) {
      console.error('Read registers failed:', err);
    }
  };

  const writeRegisters = async () => {
    try {
      const values = writeRegValues.split(',').map((v) => parseInt(v.trim()));
      await fetch('/api/services/relfar/api/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: parseInt(writeRegAddr),
          values,
        }),
      });
    } catch (err) {
      console.error('Write registers failed:', err);
    }
  };

  // Job save functions
  const saveRobotProgram = async () => {
    if (!selectedJob) {
      alert('Please select a job first');
      return;
    }
    setSaving(true);
    try {
      await fetch(`/api/jobs/${selectedJob}/robot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: robotState }),
      });
      alert('Robot program saved');
    } catch (err) {
      console.error('Save robot program failed:', err);
      alert('Failed to save robot program');
    }
    setSaving(false);
  };

  const saveLaserPreset = async () => {
    if (!selectedJob) {
      alert('Please select a job first');
      return;
    }
    setSaving(true);
    try {
      await fetch(`/api/jobs/${selectedJob}/laser`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: laserStatus }),
      });
      alert('Laser preset saved');
    } catch (err) {
      console.error('Save laser preset failed:', err);
      alert('Failed to save laser preset');
    }
    setSaving(false);
  };

  const getStatusColor = (connected: boolean): string => {
    if (!connected) return 'bg-red-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Machines Dashboard</h1>
        <p className="text-gray-500 mt-1">Live monitoring and control for robot and laser systems</p>
      </div>

      {/* Top Bar - Service Health Summary */}
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getStatusColor(robotHealth.reachable)}`}></div>
            <span className="text-sm font-medium">Robot: {robotHealth.reachable ? 'Online' : 'Offline'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getStatusColor(laserHealth.reachable)}`}></div>
            <span className="text-sm font-medium">Laser: {laserHealth.reachable ? 'Online' : 'Offline'}</span>
          </div>
        </div>

        {/* Save to Job Section */}
        <div className="flex items-center gap-3">
          <select
            value={selectedJob}
            onChange={(e) => setSelectedJob(e.target.value)}
            className="input-field text-sm py-2 px-3"
          >
            <option value="">Select a job...</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.name}
              </option>
            ))}
          </select>
          <button
            onClick={saveRobotProgram}
            disabled={!selectedJob || saving}
            className="btn-primary text-sm py-2 px-4 disabled:opacity-50"
          >
            Save Robot Program
          </button>
          <button
            onClick={saveLaserPreset}
            disabled={!selectedJob || saving}
            className="btn-primary text-sm py-2 px-4 disabled:opacity-50"
          >
            Save Laser Preset
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN - ROBOT PANEL */}
        <div className="space-y-4">
          {/* Connection Section */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Robot Control</h2>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(robotHealth.reachable)}`}></div>
                <span className="text-xs font-medium">{robotHealth.reachable ? 'Reachable' : 'Unreachable'}</span>
              </div>
            </div>

            <div className="space-y-3">
              {/* IP/Port Configuration */}
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="IP Address"
                  value={robotIP}
                  onChange={(e) => setRobotIP(e.target.value)}
                  disabled={robotState.connected}
                  className="input-field text-sm py-2 px-3 disabled:bg-gray-100"
                />
                <input
                  type="text"
                  placeholder="Port"
                  value={robotPort}
                  onChange={(e) => setRobotPort(e.target.value)}
                  disabled={robotState.connected}
                  className="input-field text-sm py-2 px-3 disabled:bg-gray-100"
                />
                <button
                  onClick={robotState.connected ? disconnectRobot : connectRobot}
                  disabled={robotConnecting}
                  className={`py-2 px-3 rounded-lg font-medium text-sm transition-colors ${
                    robotState.connected
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'btn-primary'
                  } disabled:opacity-50`}
                >
                  {robotConnecting ? 'Connecting...' : robotState.connected ? 'Disconnect' : 'Connect'}
                </button>
              </div>

              {/* Status Indicators */}
              <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-gray-600">Simulation:</span>
                  <div
                    className={`w-2 h-2 rounded-full ${robotState.simulating ? 'bg-yellow-500' : 'bg-gray-300'}`}
                  ></div>
                </div>
              </div>

              {/* Control Buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={robotStartup}
                  disabled={!robotState.connected}
                  className="btn-secondary text-sm py-2 px-2 disabled:opacity-50"
                >
                  Startup
                </button>
                <button
                  onClick={robotEnable}
                  disabled={!robotState.connected}
                  className="btn-secondary text-sm py-2 px-2 disabled:opacity-50"
                >
                  Enable
                </button>
                <button
                  onClick={robotDisable}
                  disabled={!robotState.connected}
                  className="btn-secondary text-sm py-2 px-2 disabled:opacity-50"
                >
                  Disable
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={robotStop}
                  disabled={!robotState.connected}
                  className="btn-secondary text-sm py-2 px-2 disabled:opacity-50"
                >
                  Stop
                </button>
                <button
                  onClick={robotClearAlarm}
                  disabled={!robotState.connected}
                  className="btn-secondary text-sm py-2 px-2 disabled:opacity-50"
                >
                  Clear Alarm
                </button>
                <button
                  onClick={robotHome}
                  disabled={!robotState.connected}
                  className="btn-secondary text-sm py-2 px-2 disabled:opacity-50"
                >
                  Quantum (Home)
                </button>
              </div>
            </div>
          </div>

          {/* Live State Section */}
          <div className="card">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Live State</h3>

            {/* Joint Positions */}
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Joint Positions</p>
              <div className="grid grid-cols-6 gap-1">
                {robotState.joint_positions.map((pos, idx) => (
                  <div key={idx} className="bg-gray-50 rounded p-2 text-center">
                    <p className="text-xs font-medium">J{idx + 1}</p>
                    <p className="text-sm font-bold text-brand-600">{pos.toFixed(1)}°</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Cartesian Position */}
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Cartesian Position</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-50 rounded p-2 text-center">
                  <p className="text-xs font-medium">X</p>
                  <p className="text-sm font-bold text-brand-600">{robotState.cartesian_position.x.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 rounded p-2 text-center">
                  <p className="text-xs font-medium">Y</p>
                  <p className="text-sm font-bold text-brand-600">{robotState.cartesian_position.y.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 rounded p-2 text-center">
                  <p className="text-xs font-medium">Z</p>
                  <p className="text-sm font-bold text-brand-600">{robotState.cartesian_position.z.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 rounded p-2 text-center">
                  <p className="text-xs font-medium">Rx</p>
                  <p className="text-sm font-bold text-brand-600">{robotState.cartesian_position.rx.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 rounded p-2 text-center">
                  <p className="text-xs font-medium">Ry</p>
                  <p className="text-sm font-bold text-brand-600">{robotState.cartesian_position.ry.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 rounded p-2 text-center">
                  <p className="text-xs font-medium">Rz</p>
                  <p className="text-sm font-bold text-brand-600">{robotState.cartesian_position.rz.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Status Indicators */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 rounded p-2">
                <p className="text-gray-600 mb-1">Servo Enabled</p>
                <p className={`font-bold ${robotState.servo_enabled ? 'text-green-600' : 'text-red-600'}`}>
                  {robotState.servo_enabled ? 'Yes' : 'No'}
                </p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="text-gray-600 mb-1">Moving</p>
                <p className={`font-bold ${robotState.moving ? 'text-blue-600' : 'text-gray-600'}`}>
                  {robotState.moving ? 'Yes' : 'No'}
                </p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="text-gray-600 mb-1">Error</p>
                <p className={`font-bold ${robotState.error ? 'text-red-600' : 'text-green-600'}`}>
                  {robotState.error || 'None'}
                </p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="text-gray-600 mb-1">Simulation Mode</p>
                <p className={`font-bold ${robotState.simulating ? 'text-yellow-600' : 'text-gray-600'}`}>
                  {robotState.simulating ? 'On' : 'Off'}
                </p>
              </div>
            </div>
          </div>

          {/* Jog Controls Section */}
          <div className="card">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Jog Controls</h3>

            {/* Speed and Distance Sliders */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Speed: {jogSpeed}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={jogSpeed}
                  onChange={(e) => setJogSpeed(parseInt(e.target.value))}
                  disabled={!robotState.connected}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Distance: {jogDistance}mm</label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={jogDistance}
                  onChange={(e) => setJogDistance(parseInt(e.target.value))}
                  disabled={!robotState.connected}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                />
              </div>
            </div>

            {/* Cartesian Jog Buttons */}
            <p className="text-xs font-medium text-gray-600 mb-2">Cartesian</p>
            <div className="grid grid-cols-6 gap-1 mb-4">
              <button
                onClick={() => jogCartesian('x', 1)}
                disabled={!robotState.connected}
                className="btn-secondary text-xs py-2 px-1 disabled:opacity-50"
              >
                +X
              </button>
              <button
                onClick={() => jogCartesian('x', -1)}
                disabled={!robotState.connected}
                className="btn-secondary text-xs py-2 px-1 disabled:opacity-50"
              >
                -X
              </button>
              <button
                onClick={() => jogCartesian('y', 1)}
                disabled={!robotState.connected}
                className="btn-secondary text-xs py-2 px-1 disabled:opacity-50"
              >
                +Y
              </button>
              <button
                onClick={() => jogCartesian('y', -1)}
                disabled={!robotState.connected}
                className="btn-secondary text-xs py-2 px-1 disabled:opacity-50"
              >
                -Y
              </button>
              <button
                onClick={() => jogCartesian('z', 1)}
                disabled={!robotState.connected}
                className="btn-secondary text-xs py-2 px-1 disabled:opacity-50"
              >
                +Z
              </button>
              <button
                onClick={() => jogCartesian('z', -1)}
                disabled={!robotState.connected}
                className="btn-secondary text-xs py-2 px-1 disabled:opacity-50"
              >
                -Z
              </button>
            </div>

            <div className="grid grid-cols-6 gap-1 mb-4">
              <button
                onClick={() => jogCartesian('rx', 1)}
                disabled={!robotState.connected}
                className="btn-secondary text-xs py-2 px-1 disabled:opacity-50"
              >
                +Rx
              </button>
              <button
                onClick={() => jogCartesian('rx', -1)}
                disabled={!robotState.connected}
                className="btn-secondary text-xs py-2 px-1 disabled:opacity-50"
              >
                -Rx
              </button>
              <button
                onClick={() => jogCartesian('ry', 1)}
                disabled={!robotState.connected}
                className="btn-secondary text-xs py-2 px-1 disabled:opacity-50"
              >
                +Ry
              </button>
              <button
                onClick={() => jogCartesian('ry', -1)}
                disabled={!robotState.connected}
                className="btn-secondary text-xs py-2 px-1 disabled:opacity-50"
              >
                -Ry
              </button>
              <button
                onClick={() => jogCartesian('rz', 1)}
                disabled={!robotState.connected}
                className="btn-secondary text-xs py-2 px-1 disabled:opacity-50"
              >
                +Rz
              </button>
              <button
                onClick={() => jogCartesian('rz', -1)}
                disabled={!robotState.connected}
                className="btn-secondary text-xs py-2 px-1 disabled:opacity-50"
              >
                -Rz
              </button>
            </div>

            {/* Joint Jog Buttons */}
            <p className="text-xs font-medium text-gray-600 mb-2">Joints</p>
            <div className="grid grid-cols-12 gap-1">
              {[1, 2, 3, 4, 5, 6].map((joint) => (
                <div key={joint} className="col-span-2">
                  <button
                    onClick={() => jogJoint(joint, 1)}
                    disabled={!robotState.connected}
                    className="btn-secondary text-xs py-1 px-1 w-full disabled:opacity-50"
                  >
                    J{joint}+
                  </button>
                  <button
                    onClick={() => jogJoint(joint, -1)}
                    disabled={!robotState.connected}
                    className="btn-secondary text-xs py-1 px-1 w-full disabled:opacity-50"
                  >
                    J{joint}-
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - LASER PANEL */}
        <div className="space-y-4">
          {/* Connection Section */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Laser Control</h2>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(laserHealth.reachable)}`}></div>
                <span className="text-xs font-medium">{laserHealth.reachable ? 'Reachable' : 'Unreachable'}</span>
              </div>
            </div>

            <div className="space-y-3">
              {/* COM Port Selection */}
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={selectedPort}
                  onChange={(e) => setSelectedPort(e.target.value)}
                  disabled={laserStatus.connected}
                  className="input-field text-sm py-2 px-3 disabled:bg-gray-100 col-span-2"
                >
                  {laserPorts.map((port) => (
                    <option key={port} value={port}>
                      {port}
                    </option>
                  ))}
                </select>
                <button
                  onClick={connectLaser}
                  disabled={!laserHealth.reachable || laserStatus.connected}
                  className="btn-primary text-sm py-2 px-3 disabled:opacity-50"
                >
                  Scan
                </button>
              </div>

              {/* Manual Connection Settings */}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Baud Rate"
                  value={laserBaudRate}
                  onChange={(e) => setLaserBaudRate(e.target.value)}
                  disabled={laserStatus.connected}
                  className="input-field text-sm py-2 px-3 disabled:bg-gray-100"
                />
                <select
                  value={laserParity}
                  onChange={(e) => setLaserParity(e.target.value)}
                  disabled={laserStatus.connected}
                  className="input-field text-sm py-2 px-3 disabled:bg-gray-100"
                >
                  <option value="N">Parity: None</option>
                  <option value="E">Parity: Even</option>
                  <option value="O">Parity: Odd</option>
                </select>
              </div>

              <input
                type="text"
                placeholder="Slave ID"
                value={laserSlaveID}
                onChange={(e) => setLaserSlaveID(e.target.value)}
                disabled={laserStatus.connected}
                className="input-field text-sm py-2 px-3 disabled:bg-gray-100"
              />

              {/* Connect/Disconnect Button */}
              <button
                onClick={laserStatus.connected ? disconnectLaser : connectLaser}
                disabled={laserConnecting || !laserHealth.reachable}
                className={`w-full py-2 px-3 rounded-lg font-medium text-sm transition-colors ${
                  laserStatus.connected
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'btn-primary'
                } disabled:opacity-50`}
              >
                {laserConnecting ? 'Connecting...' : laserStatus.connected ? 'Disconnect' : 'Connect'}
              </button>
            </div>
          </div>

          {/* Live Status Section */}
          <div className="card">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Live Status</h3>

            {/* Connection Status */}
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <p className="text-xs font-medium text-gray-600 mb-2">Connection</p>
              <p className={`text-sm font-bold ${laserStatus.connected ? 'text-green-600' : 'text-red-600'}`}>
                {laserStatus.connected ? 'Connected' : 'Disconnected'}
              </p>
              {laserStatus.connected && (
                <div className="mt-2 text-xs text-gray-600 space-y-1">
                  <p>Port: {laserStatus.port}</p>
                  <p>Baud: {laserStatus.baudrate}</p>
                  <p>Parity: {laserStatus.parity}</p>
                  <p>Slave ID: {laserStatus.slave_id}</p>
                </div>
              )}
            </div>

            {/* Registers Table */}
            {laserStatus.registers && laserStatus.registers.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-600 mb-2">Registers</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 border-b border-gray-200">
                      <tr>
                        <th className="px-2 py-1 text-left">Address</th>
                        <th className="px-2 py-1 text-left">Value</th>
                        <th className="px-2 py-1 text-left">Hex</th>
                      </tr>
                    </thead>
                    <tbody>
                      {laserStatus.registers.slice(0, 10).map((reg, idx) => (
                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-2 py-1 font-mono">{reg.address}</td>
                          <td className="px-2 py-1 font-mono">{reg.value}</td>
                          <td className="px-2 py-1 font-mono text-brand-600">{reg.hex}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {laserStatus.last_read && (
                  <p className="text-xs text-gray-500 mt-2">Last read: {laserStatus.last_read}</p>
                )}
              </div>
            )}
          </div>

          {/* Register Controls Section */}
          <div className="card">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Register Controls</h3>

            {/* Read Registers */}
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <p className="text-xs font-medium text-gray-600 mb-2">Read Registers</p>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Address"
                  value={readRegAddr}
                  onChange={(e) => setReadRegAddr(e.target.value)}
                  disabled={!laserStatus.connected}
                  className="input-field text-sm py-2 px-3 disabled:bg-gray-100"
                />
                <input
                  type="text"
                  placeholder="Count"
                  value={readRegCount}
                  onChange={(e) => setReadRegCount(e.target.value)}
                  disabled={!laserStatus.connected}
                  className="input-field text-sm py-2 px-3 disabled:bg-gray-100"
                />
                <select
                  value={readRegType}
                  onChange={(e) => setReadRegType(e.target.value)}
                  disabled={!laserStatus.connected}
                  className="input-field text-sm py-2 px-3 disabled:bg-gray-100"
                >
                  <option value="holding">Holding</option>
                  <option value="input">Input</option>
                </select>
              </div>
              <button
                onClick={readRegisters}
                disabled={!laserStatus.connected}
                className="btn-primary w-full text-sm py-2 disabled:opacity-50"
              >
                Read
              </button>
            </div>

            {/* Write Registers */}
            <div className="p-3 bg-gray-50 rounded">
              <p className="text-xs font-medium text-gray-600 mb-2">Write Registers</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Address"
                  value={writeRegAddr}
                  onChange={(e) => setWriteRegAddr(e.target.value)}
                  disabled={!laserStatus.connected}
                  className="input-field text-sm py-2 px-3 disabled:bg-gray-100"
                />
                <input
                  type="text"
                  placeholder="Values (comma-separated)"
                  value={writeRegValues}
                  onChange={(e) => setWriteRegValues(e.target.value)}
                  disabled={!laserStatus.connected}
                  className="input-field text-sm py-2 px-3 disabled:bg-gray-100"
                />
              </div>
              <button
                onClick={writeRegisters}
                disabled={!laserStatus.connected}
                className="btn-primary w-full text-sm py-2 disabled:opacity-50"
              >
                Write
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
