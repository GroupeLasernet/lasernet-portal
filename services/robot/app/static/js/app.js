/* ===== Elfin Cobot Studio – Frontend Application v2 ===== */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentProjectId = null;
let currentDxfId = null;
let currentProgramId = null;
let robotPolling = null;
let currentTab = 'visual';
let sidebarOpen = true;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function api(url, options = {}) {
    try {
        const resp = await fetch(url, options);
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: resp.statusText }));
            let msg = err.detail ?? resp.statusText;
            // FastAPI validation errors return detail as an array of dicts;
            // other endpoints may return a dict. Stringify so the toast is readable.
            if (typeof msg !== "string") {
                try { msg = JSON.stringify(msg); } catch { msg = String(msg); }
            }
            throw new Error(msg);
        }
        const ct = resp.headers.get("content-type") || "";
        if (ct.includes("json")) return resp.json();
        if (ct.includes("svg") || ct.includes("html")) return resp.text();
        return resp.json();
    } catch (e) {
        toast(e.message || String(e), "error");
        throw e;
    }
}

function formData(obj) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(obj)) fd.append(k, v);
    return fd;
}

function toast(msg, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

function val(id) { return parseFloat(document.getElementById(id).value) || 0; }
function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

function setTextSafe(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setInputVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function getInputVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
}

// ---------------------------------------------------------------------------
// Tab Switching
// ---------------------------------------------------------------------------

function switchTab(tabName) {
    currentTab = tabName;

    // Update sidebar buttons
    document.querySelectorAll('.sidebar-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(tc => {
        tc.classList.toggle('active', tc.id === `tab-${tabName}`);
    });

    // Trigger resize for 3D view when switching to visual tab
    if (tabName === 'visual' && robot3d) {
        setTimeout(() => robot3d._onResize(), 50);
    }

    // Pull the error log + station config as soon as the user opens Settings
    if (tabName === 'settings') {
        setTimeout(refreshErrorLog, 50);
        setTimeout(loadRobotConfig, 50);
        startErrorLogAutoRefresh();
    } else {
        stopErrorLogAutoRefresh();
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebarOpen = !sidebarOpen;
    if (sidebarOpen) {
        sidebar.style.width = '';
        sidebar.querySelectorAll('span').forEach(s => s.style.display = '');
        document.getElementById('sidebarArrow').style.transform = '';
    } else {
        sidebar.style.width = '48px';
        sidebar.querySelectorAll('.sidebar-tab span').forEach(s => s.style.display = 'none');
        document.getElementById('sidebarArrow').style.transform = 'rotate(180deg)';
    }
    // Give layout time to settle, then resize 3D
    setTimeout(() => {
        if (robot3d) robot3d._onResize();
    }, 250);
}

// ---------------------------------------------------------------------------
// Robot Connection  (IP / port read from Settings tab only)
// ---------------------------------------------------------------------------

async function connectRobot() {
    const ip = getInputVal("settingsIp") || "192.168.10.10";
    const port = getInputVal("settingsPort") || "7001";
    const result = await api("/api/robot/connect", {
        method: "POST",
        body: formData({ ip, port }),
    });
    toast(result.message, result.connected ? "success" : "info");
    updateConnectionUI(result);
    startPolling();
}

async function disconnectRobot() {
    stopPolling();
    await api("/api/robot/disconnect", { method: "POST" });
    toast("Disconnected", "info");
    updateConnectionUI({ connected: false, simulation_mode: false });
}

/** Update BOTH the header status dot and the Settings-tab status */
function updateConnectionUI(state) {
    const pairs = [
        { dot: "statusDot",         text: "statusText",         sim: "simBadge" },
        { dot: "settingsStatusDot", text: "settingsStatusText", sim: "settingsSimBadge" },
    ];
    pairs.forEach(({ dot, text, sim }) => {
        const dotEl  = document.getElementById(dot);
        const textEl = document.getElementById(text);
        const simEl  = document.getElementById(sim);
        if (!dotEl) return;

        if (state.simulation_mode) {
            dotEl.className = "status-dot simulation";
            if (textEl) textEl.textContent = "Simulation";
            if (simEl) simEl.style.display = "inline";
        } else if (state.connected) {
            dotEl.className = "status-dot connected";
            if (textEl) textEl.textContent = "Connected";
            if (simEl) simEl.style.display = "none";
        } else {
            dotEl.className = "status-dot disconnected";
            if (textEl) textEl.textContent = "Disconnected";
            if (simEl) simEl.style.display = "none";
        }
    });

    // Update enabled/disabled badge
    const enableBadge = document.getElementById("enableBadge");
    if (enableBadge) {
        if (state.connected || state.simulation_mode) {
            enableBadge.style.display = "inline";
            if (state.servo_enabled) {
                enableBadge.className = "enable-badge enabled";
                enableBadge.textContent = "ENABLED";
            } else {
                enableBadge.className = "enable-badge disabled";
                enableBadge.textContent = "DISABLED";
            }
        } else {
            enableBadge.style.display = "none";
        }
    }

    // Highlight Enable / Disable buttons
    const btnEnable  = document.getElementById("btnEnable");
    const btnDisable = document.getElementById("btnDisable");
    if (btnEnable && btnDisable) {
        if (state.connected || state.simulation_mode) {
            if (state.servo_enabled) {
                btnEnable.className  = "btn btn-sm btn-success servo-btn active-state";
                btnDisable.className = "btn btn-sm btn-warning servo-btn dim-state";
            } else {
                btnEnable.className  = "btn btn-sm btn-success servo-btn dim-state";
                btnDisable.className = "btn btn-sm btn-warning servo-btn active-state";
            }
        } else {
            btnEnable.className  = "btn btn-sm btn-success servo-btn";
            btnDisable.className = "btn btn-sm btn-warning servo-btn";
        }
    }

    // Free Mode — sticky-toggle button + full-screen overlay while engaged.
    // The CSS class on <body> drives the overlay; the button's own highlight
    // (red glow, pulse) is also gated by body.free-mode-active via style.css.
    //
    // IMPORTANT: we only latch free-mode-active if EITHER
    //   (a) the user clicked the UI Free Mode button (window._freeModeUserIntent), OR
    //   (b) the backend reports drag_mode_source === "wrist_button" (physical
    //       button on the arm flange triggered it — see robot_comm.py
    //       _poll_wrist_buttons).
    // This prevents a stale drag_mode=true in the polled state from applying
    // the overlay on fresh page load while still honoring the hardware button.
    const btnFreeMode = document.getElementById("btnFreeMode");
    const stateSaysActive = !!state.drag_mode && (state.connected || state.simulation_mode);
    const wristTriggered = state.drag_mode_source === "wrist_button";
    const freeActive = stateSaysActive && (!!window._freeModeUserIntent || wristTriggered);

    // If the server reports Free Mode is OFF, clear the user-intent latch so a
    // server-side timeout / error exit drops us out of Free Mode in the UI too.
    if (!stateSaysActive) window._freeModeUserIntent = false;

    // Wrist Waypoint button — backend bumps state.waypoint_capture_count on
    // each rising edge. Toast the captured pose so Hugo has feedback that the
    // button fired and what was recorded.
    if (typeof state.waypoint_capture_count === "number") {
        if (typeof window._lastWaypointCount === "undefined") {
            window._lastWaypointCount = state.waypoint_capture_count;
        } else if (state.waypoint_capture_count > window._lastWaypointCount) {
            window._lastWaypointCount = state.waypoint_capture_count;
            const p = state.last_captured_pose;
            if (Array.isArray(p) && p.length >= 6) {
                toast(
                    `Waypoint captured: X=${p[0].toFixed(1)} Y=${p[1].toFixed(1)} Z=${p[2].toFixed(1)}`,
                    "success"
                );
            } else {
                toast("Waypoint button pressed", "success");
            }
        }
    }

    document.body.classList.toggle("free-mode-active", freeActive);
    if (btnFreeMode) {
        btnFreeMode.textContent = freeActive ? "Exit Free Mode" : "Free Mode";
        btnFreeMode.setAttribute("aria-pressed", freeActive ? "true" : "false");
        btnFreeMode.className = freeActive
            ? "btn btn-sm position-btn"        // CSS handles highlight while body class set
            : "btn btn-sm btn-info position-btn";
    }
}

// ---------------------------------------------------------------------------
// Robot State Polling
// ---------------------------------------------------------------------------

let pollingActive = false;

function startPolling() {
    if (pollingActive) return;
    pollingActive = true;
    pollRobotState();
}

function stopPolling() {
    pollingActive = false;
}

async function pollRobotState() {
    if (!pollingActive) return;
    try {
        const state = await fetch("/api/robot/state").then(r => r.json());
        updateConnectionUI(state);
        updateVisualTab(state);

        // Stop polling if robot disconnected and not in simulation
        if (!state.connected && !state.simulation_mode) {
            pollingActive = false;
            return;
        }
    } catch (e) {
        // Server unreachable – stop polling
        pollingActive = false;
        return;
    }
    if (pollingActive) {
        setTimeout(pollRobotState, 500);
    }
}

function updateVisualTab(state) {
    // TCP Position
    if (state.pose) {
        setTextSafe("tcpX", (state.pose.x || 0).toFixed(3));
        setTextSafe("tcpY", (state.pose.y || 0).toFixed(3));
        setTextSafe("tcpZ", (state.pose.z || 0).toFixed(3));
        setTextSafe("tcpRx", (state.pose.rx || 0).toFixed(3));
        setTextSafe("tcpRy", (state.pose.ry || 0).toFixed(3));
        setTextSafe("tcpRz", (state.pose.rz || 0).toFixed(3));
    }

    // Joint angles
    if (state.joint_positions && state.joint_positions.length >= 6) {
        for (let i = 0; i < 6; i++) {
            const jn = i + 1;
            setTextSafe(`j${jn}`, state.joint_positions[i].toFixed(3));
            // Sync move input only if user hasn't edited it
            if (!moveUserEdited[jn]) {
                const moveInput = document.getElementById(`moveJ${jn}`);
                if (moveInput && document.activeElement !== moveInput) {
                    moveInput.value = state.joint_positions[i].toFixed(1);
                }
            }
            // Re-check GO button highlight (angle may have converged to target)
            _updateGoButton(jn);
        }
        // Update 3D robot visualization
        if (robot3d) {
            robot3d.updateJoints(
                state.joint_positions[0],
                state.joint_positions[1],
                state.joint_positions[2],
                state.joint_positions[3],
                state.joint_positions[4],
                state.joint_positions[5]
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Robot Control Buttons
// ---------------------------------------------------------------------------

async function enableServo() {
    flashBtn(document.getElementById("btnEnable"));
    await api("/api/robot/enable", { method: "POST" });
    toast("Servo enabled", "success");
}

async function disableServo() {
    flashBtn(document.getElementById("btnDisable"));
    await api("/api/robot/disable", { method: "POST" });
    toast("Servo disabled", "info");
}

async function clearAlarm() {
    const caller = event && event.currentTarget;
    flashBtn(caller);
    await api("/api/robot/clear-alarm", { method: "POST" });
    toast("Alarm cleared", "success");
}

async function toggleFreeMode() {
    const btn = document.getElementById("btnFreeMode");
    flashBtn(btn);
    try {
        const res = await api("/api/robot/drag-mode", {
            method: "POST",
            body: JSON.stringify({}),  // empty body = toggle
            headers: { "Content-Type": "application/json" }
        });
        if (res && typeof res.drag_mode !== "undefined") {
            // Latch user intent so updateConnectionUI() will keep the overlay
            // on across poll ticks (updateConnectionUI requires both server
            // state AND this flag before turning the overlay on).
            window._freeModeUserIntent = !!res.drag_mode;
            // Immediate UI sync — don't wait for the next poll tick.
            document.body.classList.toggle("free-mode-active", !!res.drag_mode);
            if (btn) {
                btn.textContent = res.drag_mode ? "Exit Free Mode" : "Free Mode";
                btn.setAttribute("aria-pressed", res.drag_mode ? "true" : "false");
                btn.className = res.drag_mode
                    ? "btn btn-sm position-btn"
                    : "btn btn-sm btn-info position-btn";
            }
            toast(res.drag_mode ? "Free Mode ON — you can move the arm by hand" : "Free Mode OFF",
                  res.drag_mode ? "success" : "info");
        }
    } catch (e) {
        // error already shown by api()
    }
}

async function stopRobot() {
    const caller = event && event.currentTarget;
    flashBtn(caller);
    await api("/api/robot/stop", { method: "POST" });
    toast("Stop sent", "info");
}

// ---------------------------------------------------------------------------
// Speed Control
// ---------------------------------------------------------------------------

function updateSpeed(val) {
    document.getElementById("speedValue").textContent = val;
}

function changeSpeed(delta) {
    const slider = document.getElementById("speedSlider");
    let v = parseInt(slider.value) + delta;
    v = Math.max(1, Math.min(100, v));
    slider.value = v;
    updateSpeed(v);
}

// Speed multiplier — scales the absolute 100% ceiling.
// Slider stores integer 1..30 == 0.1× .. 3.0× (divide by 10 for display/use).
// Max is a placeholder; raise once Hugo picks the final safe ceiling.
function _getSpeedMult() {
    const raw = parseInt(document.getElementById("speedMultSlider")?.value || "10");
    return Math.max(1, raw) / 10;   // 0.1× minimum, whatever the upper bound is
}

function updateSpeedMult(val) {
    const mult = (parseInt(val) / 10).toFixed(1);
    const el = document.getElementById("speedMultValue");
    if (el) el.textContent = mult;
}

function changeSpeedMult(delta) {
    const slider = document.getElementById("speedMultSlider");
    if (!slider) return;
    // delta is in multiplier units (e.g. 0.1), convert to slider units
    let v = parseInt(slider.value) + Math.round(delta * 10);
    v = Math.max(parseInt(slider.min), Math.min(parseInt(slider.max), v));
    slider.value = v;
    updateSpeedMult(v);
}

// ---------------------------------------------------------------------------
// Joint Jog
// ---------------------------------------------------------------------------

/** Flash a 'pressed' class on a button element for visual feedback */
function flashBtn(btn) {
    if (!btn) return;
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 300);
}

async function jogJoint(jointNum, direction) {
    // Visual feedback
    const caller = event && event.currentTarget;
    flashBtn(caller);

    const step = parseFloat(document.getElementById("jogStep").value) || 10;
    const speedPct = parseInt(document.getElementById("speedSlider").value) || 10;
    const speed = (speedPct / 100) * 180 * _getSpeedMult(); // base 180°/s × multiplier

    try {
        await api("/api/robot/jog-joint", {
            method: "POST",
            body: formData({
                joint: jointNum,
                distance: step * direction,
                speed: speed,
            }),
        });
    } catch (e) { /* handled by api() */ }
}

// ---------------------------------------------------------------------------
// Cartesian Jog
// ---------------------------------------------------------------------------

async function jogCartesian(axis, direction) {
    // Visual feedback — flash the clicked button via event
    const caller = event && event.currentTarget;
    flashBtn(caller);

    const isRotation = axis.startsWith('r');
    const step = isRotation
        ? (parseFloat(document.getElementById("jogRotStep").value) || 5)
        : (parseFloat(document.getElementById("jogStep").value) || 10);
    const speedPct = parseInt(document.getElementById("speedSlider").value) || 10;
    const speed = (speedPct / 100) * 180 * _getSpeedMult(); // base 180 × multiplier

    try {
        await api("/api/robot/jog", {
            method: "POST",
            body: formData({
                axis: axis,
                distance: step * direction,
                speed: speed,
            }),
        });
    } catch (e) { /* handled by api() */ }
}

// ---------------------------------------------------------------------------
// Move Joint To (absolute position)
// ---------------------------------------------------------------------------

// Track which move inputs the user has modified (so polling doesn't overwrite)
const moveUserEdited = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false };

/** +/− buttons adjust the angle value in the input box */
function moveAdjust(jointNum, direction) {
    const caller = event && event.currentTarget;
    flashBtn(caller);

    const input = document.getElementById(`moveJ${jointNum}`);
    const step = parseFloat(document.getElementById("jogStep").value) || 1;
    let val = parseFloat(input.value) || 0;
    val += step * direction;
    val = Math.round(val * 1000) / 1000;
    input.value = val;
    moveUserEdited[jointNum] = true;
    _updateGoButton(jointNum);
}

/** Called when the user types directly in the move input */
function moveInputChanged(jointNum) {
    moveUserEdited[jointNum] = true;
    _updateGoButton(jointNum);
}

/** Highlight or dim the GO button based on whether the input differs from current angle */
function _updateGoButton(jointNum) {
    const input = document.getElementById(`moveJ${jointNum}`);
    const goBtn = document.getElementById(`goJ${jointNum}`);
    if (!input || !goBtn) return;

    const targetVal = parseFloat(input.value) || 0;
    const currentEl = document.getElementById(`j${jointNum}`);
    const currentVal = currentEl ? parseFloat(currentEl.textContent) || 0 : 0;

    // Consider "different" if more than 0.5° apart
    const isDifferent = Math.abs(targetVal - currentVal) > 0.5;

    if (isDifferent && moveUserEdited[jointNum]) {
        goBtn.classList.remove('dim');
        goBtn.classList.add('ready');
        goBtn.disabled = false;
        input.classList.add('modified');
    } else {
        goBtn.classList.remove('ready');
        goBtn.classList.add('dim');
        goBtn.disabled = true;
        input.classList.remove('modified');
    }
}

/** GO button — send joint to the absolute angle in the input, then dim the button */
async function moveGo(jointNum) {
    const goBtn = document.getElementById(`goJ${jointNum}`);
    flashBtn(goBtn);

    const angle = parseFloat(document.getElementById(`moveJ${jointNum}`).value) || 0;
    const speedPct = parseInt(document.getElementById("speedSlider").value) || 10;
    const speed = (speedPct / 100) * 180 * _getSpeedMult();

    // Immediately dim the button
    goBtn.classList.remove('ready');
    goBtn.classList.add('dim');
    goBtn.disabled = true;
    document.getElementById(`moveJ${jointNum}`).classList.remove('modified');
    moveUserEdited[jointNum] = false;

    try {
        await api("/api/robot/move-joint-to", {
            method: "POST",
            body: formData({ joint: jointNum, angle: angle, speed: speed }),
        });
    } catch (e) { /* handled by api() */ }
}

async function goQuantum() {
    const caller = event && event.currentTarget;
    flashBtn(caller);

    const speedPct = parseInt(document.getElementById("speedSlider").value) || 10;
    const speed = (speedPct / 100) * 180 * _getSpeedMult();

    try {
        await api("/api/robot/quantum", {
            method: "POST",
            body: formData({ speed: speed }),
        });
        toast("Moving to Quantum position", "success");
    } catch (e) { /* handled by api() */ }
}

// ---------------------------------------------------------------------------
// Saved positions (tap = go, hold 2s = save current pose).
// One set of handlers drives all slots; each slot has its own state record so
// pressing two buttons concurrently doesn't cross wires.
// ---------------------------------------------------------------------------
const POSITION_HOLD_MS = 2000;
const _posState = {
    1: { holdTimer: null, progressTimer: null, holdStart: 0, didSave: false,
         btnId: "btnPos1", barId: "pos1HoldBar" },
    2: { holdTimer: null, progressTimer: null, holdStart: 0, didSave: false,
         btnId: "btnPos2", barId: "pos2HoldBar" },
};

function _posSetBar(slot, pct) {
    const st = _posState[slot];
    if (!st) return;
    const bar = document.getElementById(st.barId);
    if (bar) bar.style.width = pct + "%";
}

function positionPressStart(slot) {
    const st = _posState[slot];
    if (!st) return;
    st.didSave = false;
    st.holdStart = Date.now();
    const btn = document.getElementById(st.btnId);
    if (btn) btn.classList.add("saving");

    st.progressTimer = setInterval(() => {
        const elapsed = Date.now() - st.holdStart;
        const pct = Math.min(100, (elapsed / POSITION_HOLD_MS) * 100);
        _posSetBar(slot, pct);
    }, 50);

    st.holdTimer = setTimeout(async () => {
        st.didSave = true;
        _posSetBar(slot, 100);
        try {
            const res = await api(`/api/robot/position/${slot}/save`, { method: "POST" });
            toast(`Position ${slot} saved`, "success");
            console.log(`Saved Position ${slot} joints:`, res.joints);
        } catch (e) { /* api() toasts the error */ }
    }, POSITION_HOLD_MS);
}

async function positionPressEnd(slot) {
    const st = _posState[slot];
    if (!st) return;
    const wasHoldSave = st.didSave;
    positionPressCancel(slot); // clears timers + bar
    if (wasHoldSave) return;   // save already fired — don't also go

    // Short tap — go to saved position
    const speedPct = parseInt(document.getElementById("speedSlider").value) || 10;
    const speed = (speedPct / 100) * 180 * _getSpeedMult();
    try {
        await api(`/api/robot/position/${slot}`, {
            method: "POST",
            body: formData({ speed: speed }),
        });
        toast(`Moving to Position ${slot}`, "success");
    } catch (e) { /* handled by api() */ }
}

function positionPressCancel(slot) {
    const st = _posState[slot];
    if (!st) return;
    if (st.holdTimer)     { clearTimeout(st.holdTimer);   st.holdTimer = null; }
    if (st.progressTimer) { clearInterval(st.progressTimer); st.progressTimer = null; }
    _posSetBar(slot, 0);
    const btn = document.getElementById(st.btnId);
    if (btn) btn.classList.remove("saving");
}

// ---------------------------------------------------------------------------
// Emergency Stop — sends GrpStop
// ---------------------------------------------------------------------------
async function emergencyStop() {
    const caller = event && event.currentTarget;
    flashBtn(caller);
    try {
        await api("/api/robot/stop", { method: "POST" });
        toast("Motion stopped", "warning");
    } catch (e) { /* handled by api() */ }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

async function loadProjects() {
    const projects = await api("/api/projects");
    const list = document.getElementById("projectList");
    if (!list) return;
    if (projects.length === 0) {
        list.innerHTML = `<div class="empty-hint">No projects yet. Click <strong>+ New</strong> to start.</div>`;
        return;
    }
    list.innerHTML = projects.map(p => `
        <div class="list-item ${p.id === currentProjectId ? 'active' : ''}"
             onclick="selectProject(${p.id})">
            <div>
                <div class="name">${esc(p.name)}</div>
                <div class="meta">${p.dxf_count} DXF &middot; ${p.program_count} programs</div>
            </div>
            <button class="btn-del" onclick="event.stopPropagation(); deleteProject(${p.id})" title="Delete">&times;</button>
        </div>
    `).join("");
}

async function selectProject(id) {
    currentProjectId = id;
    currentDxfId = null;
    currentProgramId = null;
    const btnUpload = document.getElementById("btnUploadDxf");
    if (btnUpload) btnUpload.disabled = false;
    const btnGen = document.getElementById("btnGenerate");
    if (btnGen) btnGen.disabled = true;
    const btnRun = document.getElementById("btnRun");
    if (btnRun) btnRun.disabled = true;
    await loadProjects();
    await loadDxfFiles();
    await loadPrograms();
    clearDxfViewer();
}

async function deleteProject(id) {
    if (!confirm("Delete this project and all its files?")) return;
    await api(`/api/projects/${id}`, { method: "DELETE" });
    if (currentProjectId === id) {
        currentProjectId = null;
        currentDxfId = null;
        currentProgramId = null;
    }
    toast("Project deleted", "success");
    loadProjects();
}

function showNewProjectModal() {
    document.getElementById("modalContent").innerHTML = `
        <h2>New Project</h2>
        <div class="form-group">
            <label>Project name</label>
            <input type="text" id="newProjectName" placeholder="My Project" autofocus>
        </div>
        <div class="form-group">
            <label>Description (optional)</label>
            <textarea id="newProjectDesc" rows="2" placeholder="Short description..."></textarea>
        </div>
        <div class="modal-actions">
            <button class="btn" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="createProject()">Create</button>
        </div>
    `;
    document.getElementById("modalOverlay").style.display = "flex";
    setTimeout(() => document.getElementById("newProjectName").focus(), 100);
}

async function createProject() {
    const name = document.getElementById("newProjectName").value.trim();
    if (!name) { toast("Enter a name", "error"); return; }
    const desc = document.getElementById("newProjectDesc").value.trim();
    const result = await api("/api/projects", {
        method: "POST",
        body: formData({ name, description: desc }),
    });
    closeModal();
    toast(`Project "${name}" created`, "success");
    currentProjectId = result.id;
    await loadProjects();
    await loadDxfFiles();
    await loadPrograms();
    const btnUpload = document.getElementById("btnUploadDxf");
    if (btnUpload) btnUpload.disabled = false;
}

function closeModal(e) {
    if (e && e.target !== document.getElementById("modalOverlay")) return;
    document.getElementById("modalOverlay").style.display = "none";
}

// ---------------------------------------------------------------------------
// DXF Files
// ---------------------------------------------------------------------------

async function loadDxfFiles() {
    if (!currentProjectId) return;
    const files = await api(`/api/projects/${currentProjectId}/dxf`);
    const list = document.getElementById("dxfList");
    if (!list) return;
    if (files.length === 0) {
        list.innerHTML = `<div class="empty-hint">No DXF files yet. Upload one.</div>`;
        return;
    }
    list.innerHTML = files.map(f => `
        <div class="list-item ${f.id === currentDxfId ? 'active' : ''}"
             onclick="selectDxf(${f.id})">
            <div>
                <span class="name">${esc(f.filename)}</span>
                <span class="meta" style="margin-left:6px;">${f.path_count} paths</span>
            </div>
            <button class="btn-del" onclick="event.stopPropagation(); deleteDxf(${f.id})" title="Delete">&times;</button>
        </div>
    `).join("");
}

async function selectDxf(id) {
    currentDxfId = id;
    currentProgramId = null;
    const btnGen = document.getElementById("btnGenerate");
    if (btnGen) btnGen.disabled = false;
    await loadDxfFiles();
    await showDxfPreview(id);
}

async function showDxfPreview(id) {
    const data = await api(`/api/dxf/${id}`);
    const svg = await api(`/api/dxf/${id}/svg`);
    const viewer = document.getElementById("dxfViewer");
    if (viewer) viewer.innerHTML = svg;
    const b = data.bbox;
    setTextSafe("infoPathCount", `Paths: ${data.paths.length}`);
    setTextSafe("infoBBox", `Bounds: (${b.min_x.toFixed(1)}, ${b.min_y.toFixed(1)}) \u2192 (${b.max_x.toFixed(1)}, ${b.max_y.toFixed(1)})`);
    setTextSafe("viewerInfo", `DXF #${id} loaded`);
}

function clearDxfViewer() {
    const viewer = document.getElementById("dxfViewer");
    if (viewer) {
        viewer.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                </svg>
                <p>Upload a DXF file to preview paths</p>
            </div>`;
    }
    setTextSafe("infoPathCount", "Paths: \u2013");
    setTextSafe("infoBBox", "Bounds: \u2013");
    setTextSafe("infoWaypoints", "Waypoints: \u2013");
    setTextSafe("infoDistance", "Distance: \u2013");
    setTextSafe("infoTime", "Est. time: \u2013");
}

function uploadDXF() {
    if (!currentProjectId) { toast("Select a project first", "error"); return; }
    document.getElementById("fileInput").click();
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
        const result = await api(`/api/projects/${currentProjectId}/dxf`, {
            method: "POST",
            body: fd,
        });
        toast(`DXF "${file.name}" uploaded \u2013 ${result.path_count} paths found`, "success");
        await loadDxfFiles();
        await loadProjects();
        selectDxf(result.id);
    } catch (e) { /* handled by api() */ }
    event.target.value = "";
}

async function deleteDxf(id) {
    await api(`/api/dxf/${id}`, { method: "DELETE" });
    if (currentDxfId === id) { currentDxfId = null; clearDxfViewer(); }
    toast("DXF deleted", "success");
    loadDxfFiles();
    loadProjects();
}

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

async function loadPrograms() {
    if (!currentProjectId) return;
    const progs = await api(`/api/projects/${currentProjectId}/programs`);

    // DXF tab program list
    const list = document.getElementById("programList");
    if (list) {
        if (progs.length === 0) {
            list.innerHTML = `<div class="empty-hint">Generate from a DXF file.</div>`;
        } else {
            list.innerHTML = progs.map(p => `
                <div class="list-item">
                    <div>
                        <span class="name">${esc(p.name)}</span>
                        <span class="meta" style="margin-left:4px;">${p.waypoint_count} wp &middot; ${p.status}</span>
                    </div>
                    <div style="display:flex; gap:4px;">
                        <button class="btn btn-sm btn-success" onclick="selectAndRunProgram(${p.id})" title="Run">&#9654;</button>
                        <button class="btn-del" onclick="deleteProgram(${p.id})" title="Delete">&times;</button>
                    </div>
                </div>
            `).join("");
        }
    }

    // Programs tab (all programs)
    loadAllPrograms();
}

async function loadAllPrograms() {
    const allList = document.getElementById("allProgramsList");
    if (!allList) return;
    try {
        const projects = await api("/api/projects");
        let allProgs = [];
        for (const proj of projects) {
            const progs = await api(`/api/projects/${proj.id}/programs`);
            for (const p of progs) {
                allProgs.push({ ...p, projectName: proj.name });
            }
        }
        if (allProgs.length === 0) {
            allList.innerHTML = `<div class="empty-state"><p>No programs yet. Generate one from the DXF Import tab.</p></div>`;
            return;
        }
        allList.innerHTML = allProgs.map(p => `
            <div class="list-item" style="padding:12px;">
                <div>
                    <div class="name">${esc(p.name)}</div>
                    <div class="meta">${esc(p.projectName)} &middot; ${p.waypoint_count} waypoints &middot; ${p.status}</div>
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="btn btn-sm btn-success" onclick="selectAndRunProgram(${p.id})">&#9654; Run</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteProgram(${p.id})">Delete</button>
                </div>
            </div>
        `).join("");
    } catch (e) { /* silent */ }
}

async function generateProgram() {
    if (!currentDxfId) { toast("Select a DXF file first", "error"); return; }
    const data = {
        dxf_id: currentDxfId,
        name: `Program ${new Date().toLocaleTimeString()}`,
        speed: val("motionSpeed"),
        acceleration: val("motionAccel"),
        blend_radius: val("motionBlend"),
        origin_x: val("originX"),
        origin_y: val("originY"),
        origin_z: val("originZ"),
        orientation_rx: val("orientRx"),
        orientation_ry: val("orientRy"),
        orientation_rz: val("orientRz"),
        approach_height: val("approachH"),
        scale: val("dxfScale"),
        offset_x: 0,
        offset_y: 0,
    };
    const result = await api("/api/programs/generate", {
        method: "POST",
        body: formData(data),
    });
    currentProgramId = result.id;
    const btnRun = document.getElementById("btnRun");
    if (btnRun) btnRun.disabled = false;
    setTextSafe("infoWaypoints", `Waypoints: ${result.waypoint_count}`);
    setTextSafe("infoDistance", `Distance: ${result.estimated_distance_mm.toFixed(0)} mm`);
    setTextSafe("infoTime", `Est. time: ${result.estimated_time_s.toFixed(1)} s`);
    toast(`Program generated \u2013 ${result.waypoint_count} waypoints`, "success");
    loadPrograms();
}

async function selectAndRunProgram(id) {
    currentProgramId = id;
    await runProgram();
}

async function runProgram() {
    if (!currentProgramId) { toast("Generate a program first", "error"); return; }
    const result = await api(`/api/robot/run-program/${currentProgramId}`, { method: "POST" });
    toast(result.message, "success");
    loadPrograms();
}

async function deleteProgram(id) {
    await api(`/api/programs/${id}`, { method: "DELETE" });
    if (currentProgramId === id) currentProgramId = null;
    toast("Program deleted", "success");
    loadPrograms();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

async function loadSettings() {
    try {
        const s = await api("/api/settings");
        // Settings tab fields
        setInputVal("settingsIp", s.robot_ip);
        setInputVal("settingsPort", s.robot_port);
        setInputVal("settingsSpeed", s.speed);
        setInputVal("settingsAccel", s.acceleration);
        setInputVal("settingsBlend", s.blend_radius);
        // DXF work plane
        setInputVal("originX", s.origin_x);
        setInputVal("originY", s.origin_y);
        setInputVal("originZ", s.origin_z);
        setInputVal("orientRx", s.orientation_rx);
        setInputVal("orientRy", s.orientation_ry);
        setInputVal("orientRz", s.orientation_rz);
        setInputVal("approachH", s.approach_height);
        setInputVal("motionSpeed", s.speed);
        setInputVal("motionAccel", s.acceleration);
        setInputVal("motionBlend", s.blend_radius);
    } catch (e) { /* use defaults */ }
}

async function saveSettings() {
    const data = {
        robot_ip: getInputVal("settingsIp") || "192.168.10.10",
        robot_port: getInputVal("settingsPort") || 7001,
        speed: getInputVal("settingsSpeed") || 50,
        acceleration: getInputVal("settingsAccel") || 100,
        blend_radius: getInputVal("settingsBlend") || 0.5,
        origin_x: getInputVal("originX") || 400,
        origin_y: getInputVal("originY") || 0,
        origin_z: getInputVal("originZ") || 200,
        orientation_rx: getInputVal("orientRx") || 180,
        orientation_ry: getInputVal("orientRy") || 0,
        orientation_rz: getInputVal("orientRz") || 0,
        approach_height: getInputVal("approachH") || 20,
    };
    await api("/api/settings", {
        method: "POST",
        body: formData(data),
    });
    toast("Settings saved", "success");
}

// ---------------------------------------------------------------------------
// Station Config (Settings tab — edits .env and restarts service)
// ---------------------------------------------------------------------------

function _setCfgStatus(msg, color) {
    const el = document.getElementById("cfgStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = color || "var(--text-dim)";
}

async function loadRobotConfig() {
    try {
        const c = await fetch("/api/robot/config").then(r => r.json());
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val ?? "";
        };
        const check = (id, truthy) => {
            const el = document.getElementById(id);
            if (el) el.checked = String(truthy).toLowerCase() === "true";
        };
        set("cfgRobotSerial", c.ROBOT_SERIAL);
        set("cfgPortalUrl", c.PORTAL_URL);
        check("cfgSyncEnabled", c.SYNC_ENABLED);
        check("cfgDevSkipLicense", c.DEV_SKIP_LICENSE);
        check("cfgLicenseStrict", c.LICENSE_STRICT);
        // Secret is never returned — show whether one is set
        const secStatus = document.getElementById("cfgSecretStatus");
        if (secStatus) {
            secStatus.textContent = c.ROBOT_LICENSE_SECRET_set ? "(currently set — leave blank to keep)" : "(not set)";
        }
        const secInput = document.getElementById("cfgLicenseSecret");
        if (secInput) secInput.value = "";
        _setCfgStatus("Loaded · " + new Date().toLocaleTimeString());
    } catch (e) {
        _setCfgStatus("Load failed: " + e.message, "var(--red)");
    }
}

async function saveRobotConfig(restartAfter) {
    const body = {
        ROBOT_SERIAL:    document.getElementById("cfgRobotSerial").value.trim(),
        PORTAL_URL:      document.getElementById("cfgPortalUrl").value.trim(),
        SYNC_ENABLED:    document.getElementById("cfgSyncEnabled").checked,
        DEV_SKIP_LICENSE:document.getElementById("cfgDevSkipLicense").checked,
        LICENSE_STRICT:  document.getElementById("cfgLicenseStrict").checked,
    };
    const secret = document.getElementById("cfgLicenseSecret").value;
    if (secret && secret.length > 0) body.ROBOT_LICENSE_SECRET = secret;

    _setCfgStatus("Saving…");
    try {
        const res = await fetch("/api/robot/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        _setCfgStatus("Saved ✓", "var(--green)");
        toast("Station config saved", "success");
        if (restartAfter) {
            await restartRobotService();
        }
    } catch (e) {
        _setCfgStatus("Save failed: " + e.message, "var(--red)");
        toast("Save failed: " + e.message, "error");
    }
}

async function restartRobotService() {
    _setCfgStatus("Restarting service…", "var(--orange)");
    toast("Restarting robot service — UI will reconnect in ~3s", "info");
    try {
        await fetch("/api/robot/restart", { method: "POST" });
    } catch (e) {
        // Expected — the server shuts down mid-response
    }
    // Wait for service to come back up, then reload the page
    let tries = 0;
    const check = setInterval(async () => {
        tries++;
        try {
            const r = await fetch("/api/robot/config", { cache: "no-store" });
            if (r.ok) {
                clearInterval(check);
                _setCfgStatus("Service restarted ✓", "var(--green)");
                toast("Service is back up", "success");
                // Refresh error log + config to reflect the post-restart state
                setTimeout(() => { refreshErrorLog(); loadRobotConfig(); }, 500);
            }
        } catch (_) { /* still down, keep polling */ }
        if (tries > 30) {  // 30 * 1s = 30s timeout
            clearInterval(check);
            _setCfgStatus("Service didn't come back — check NSSM status", "var(--red)");
        }
    }, 1000);
}

// ---------------------------------------------------------------------------
// Error Log viewer (Settings tab)
// ---------------------------------------------------------------------------

// Client-side buffer — captures UI errors (toast, JS exceptions, unhandled
// rejections) that never reach the server log. Merged with server-side
// stderr.log entries when the panel renders.
const _clientErrorBuffer = [];
const CLIENT_ERROR_BUFFER_MAX = 500;

function _pushClientError(msg) {
    const ts = new Date().toISOString();
    _clientErrorBuffer.push(`${ts}  CLIENT  ${msg}`);
    if (_clientErrorBuffer.length > CLIENT_ERROR_BUFFER_MAX) {
        _clientErrorBuffer.shift();
    }
}

// Capture uncaught JS errors
window.addEventListener("error", (e) => {
    _pushClientError(`JS error: ${e.message} @ ${e.filename}:${e.lineno}`);
});
window.addEventListener("unhandledrejection", (e) => {
    _pushClientError(`Promise rejection: ${e.reason}`);
});

// Wrap toast() so every error-type toast is captured into the buffer.
// Done after toast is defined; safe because this file loads top-to-bottom.
(function wrapToastForErrorLog() {
    const _origToast = toast;
    window.toast = function (msg, type) {
        if (type === "error") {
            _pushClientError(`toast: ${msg}`);
        }
        return _origToast(msg, type);
    };
})();

let _errorLogTimer = null;

async function refreshErrorLog() {
    const view = document.getElementById("errorLogView");
    const status = document.getElementById("errorLogStatus");
    if (!view) return;
    try {
        const data = await fetch("/api/robot/errors?limit=300").then(r => r.json());
        const server = (data.entries || []);
        // Merge: server entries first (they already include timestamps from
        // Python logging), then client entries. Sort keeps chronological order
        // when both timestamp formats are lex-comparable (ISO-ish).
        const combined = [...server, ..._clientErrorBuffer];
        view.textContent = combined.length
            ? combined.join("\n")
            : "(no errors logged)";
        // Auto-scroll to bottom (newest)
        view.scrollTop = view.scrollHeight;
        if (status) {
            status.textContent = `${combined.length} entries · ${new Date().toLocaleTimeString()}`;
        }
    } catch (e) {
        view.textContent = `(failed to load: ${e.message})`;
        if (status) status.textContent = "load failed";
    }
}

async function clearErrorLog() {
    _clientErrorBuffer.length = 0;
    const view = document.getElementById("errorLogView");
    const status = document.getElementById("errorLogStatus");
    if (view) view.textContent = "(clearing…)";
    if (status) status.textContent = "clearing…";
    try {
        // Truncate the server-side stderr.log so historical errors are gone
        await fetch("/api/robot/errors/clear", { method: "POST" });
    } catch (_) { /* ignore */ }
    // Re-pull (should now be empty except for anything logged since truncation)
    await refreshErrorLog();
    toast("Error log cleared", "success");
}

async function copyErrorLog() {
    const view = document.getElementById("errorLogView");
    if (!view) return;
    const text = view.textContent || "";
    const stamped = `# Atelier DSM robot error log\n# Copied at ${new Date().toISOString()}\n\n${text}\n`;
    try {
        await navigator.clipboard.writeText(stamped);
        toast("Error log copied to clipboard", "success");
    } catch (e) {
        // Fallback: select the <pre> so the user can Ctrl+C manually
        const range = document.createRange();
        range.selectNodeContents(view);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        toast("Clipboard blocked — text selected, press Ctrl+C", "warning");
    }
}

function startErrorLogAutoRefresh() {
    stopErrorLogAutoRefresh();
    const cb = document.getElementById("errorLogAutoRefresh");
    if (!cb || !cb.checked) return;
    _errorLogTimer = setInterval(() => {
        const active = document.getElementById("tab-settings");
        if (active && active.classList.contains("active") && cb.checked) {
            refreshErrorLog();
        }
    }, 3000);
}

function stopErrorLogAutoRefresh() {
    if (_errorLogTimer) {
        clearInterval(_errorLogTimer);
        _errorLogTimer = null;
    }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
    // Always start with Free Mode OFF visually — user-intent latch gets set
    // only when they press the button this session.
    window._freeModeUserIntent = false;
    document.body.classList.remove("free-mode-active");
    await loadSettings();
    loadProjects();
});
