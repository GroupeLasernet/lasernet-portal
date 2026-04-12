/* ===== Elfin E03 Pro – 3D Visualization (Three.js r128) ===== */
/*
 * Clean, proportional model of the Han's Robot Elfin E03 Pro cobot.
 * White body, black motor caps on each joint, silver flange.
 *
 * DH Parameters (mm):
 *   d1=145  a2=256  a3=256  d5=84  d6=60
 */

class Robot3DView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.robotRoot = null;

        this.isMouseDown = false;
        this.mouseX = 0;
        this.mouseY = 0;
        this.cameraAngleX = 0.6;
        this.cameraAngleY = 0.8;
        this.cameraDistance = 900;

        this.tcpTrail = [];
        this.trailLine = null;
        this.tcpMarker = null;

        // Elfin E03 Pro dimensions (mm)
        this.d1 = 145;
        this.a2 = 256;
        this.a3 = 256;
        this.d5 = 84;
        this.d6 = 60;

        this.jGroups = [];
        this.detail = 3;
        this._lastAngles = [0, 0, 0, 0, 0, 0];

        this._init();
        this._buildRobot();
        this._buildEnvironment();
        this._setupControls();
        this._animate();
    }

    /* --- Detail / LOD --- */
    get seg() { return [8, 16, 24, 32, 48][this.detail - 1]; }

    setDetail(level) {
        this.detail = Math.max(1, Math.min(5, level));
        const label = document.getElementById('detailLabel');
        if (label) label.textContent = this.detail;
        this._clearRobot();
        this._buildRobot();
        this.updateJoints(...this._lastAngles);
    }

    _clearRobot() {
        if (this.robotRoot) {
            this.scene.remove(this.robotRoot);
            this._disposeGroup(this.robotRoot);
        }
        this.jGroups = [];
        this.tcpMarker = null;
    }

    _disposeGroup(obj) {
        while (obj.children.length > 0) {
            this._disposeGroup(obj.children[0]);
            obj.remove(obj.children[0]);
        }
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
        }
    }

    /* ================================================================== */
    /*  Scene Setup                                                        */
    /* ================================================================== */

    _init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0e14);

        const w = this.container.clientWidth || 100;
        const h = this.container.clientHeight || 100;
        this.camera = new THREE.PerspectiveCamera(45, w / h, 1, 5000);
        this._updateCameraPosition();

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        // Lighting
        this.scene.add(new THREE.AmbientLight(0x555566, 0.5));
        const key = new THREE.DirectionalLight(0xffffff, 0.85);
        key.position.set(250, 500, 350);
        key.castShadow = true;
        this.scene.add(key);
        const fill = new THREE.DirectionalLight(0x8899cc, 0.3);
        fill.position.set(-200, 300, -150);
        this.scene.add(fill);
        const rim = new THREE.DirectionalLight(0xaabbff, 0.2);
        rim.position.set(0, 150, -400);
        this.scene.add(rim);

        window.addEventListener('resize', () => this._onResize());
    }

    /* ================================================================== */
    /*  Materials                                                           */
    /* ================================================================== */

    _mats() {
        if (this._matCache) return this._matCache;
        this._matCache = {
            white: new THREE.MeshPhongMaterial({
                color: 0xf0f0f0, shininess: 60, specular: 0x444444
            }),
            darkGrey: new THREE.MeshPhongMaterial({
                color: 0x1a1a1e, shininess: 30, specular: 0x222222
            }),
            silver: new THREE.MeshPhongMaterial({
                color: 0xb8b8c0, shininess: 100, specular: 0x999999
            }),
            baseGrey: new THREE.MeshPhongMaterial({
                color: 0xe0e0e4, shininess: 70, specular: 0x555555
            }),
            tcp: new THREE.MeshBasicMaterial({ color: 0xff0000 }),
        };
        return this._matCache;
    }

    /* ================================================================== */
    /*  Helper: tapered cylinder (body sections)                           */
    /* ================================================================== */

    _tube(rTop, rBot, height, mat) {
        const geo = new THREE.CylinderGeometry(rTop, rBot, height, this.seg);
        const mesh = new THREE.Mesh(geo, mat || this._mats().white);
        mesh.castShadow = true;
        return mesh;
    }

    /* Motor cap disc — black disc with raised edge ring */
    _motorCap(radius, thickness) {
        const m = this._mats();
        const s = this.seg;
        const g = new THREE.Group();

        // Main disc
        const disc = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, thickness, s),
            m.darkGrey
        );
        g.add(disc);

        // Edge ring
        if (this.detail >= 2) {
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(radius * 0.85, thickness * 0.35, 8, s),
                m.darkGrey
            );
            g.add(ring);
        }

        // Center dot
        const dot = new THREE.Mesh(
            new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, thickness + 1, s),
            m.silver
        );
        g.add(dot);

        return g;
    }

    /* Joint housing — sphere or elongated sphere between motor caps */
    _jointSphere(radius, scaleY) {
        const geo = new THREE.SphereGeometry(radius, this.seg, this.seg / 2);
        const mesh = new THREE.Mesh(geo, this._mats().white);
        if (scaleY) mesh.scale.y = scaleY;
        mesh.castShadow = true;
        return mesh;
    }

    /* Add motor caps on both sides of a joint (along local Y) */
    _addCaps(parent, capR, yOff, thick) {
        thick = thick || 6;
        const c1 = this._motorCap(capR, thick);
        c1.rotation.x = Math.PI / 2;
        c1.position.y = yOff;
        parent.add(c1);

        const c2 = this._motorCap(capR, thick);
        c2.rotation.x = -Math.PI / 2;
        c2.position.y = -yOff;
        parent.add(c2);
    }

    /* Arm link — tapered cylinder along X axis */
    _armLink(length, rStart, rEnd) {
        const geo = new THREE.CylinderGeometry(rEnd, rStart, length, this.seg);
        const mesh = new THREE.Mesh(geo, this._mats().white);
        mesh.rotation.z = Math.PI / 2;
        mesh.position.x = length / 2;
        mesh.castShadow = true;
        return mesh;
    }

    /* ================================================================== */
    /*  Build the robot kinematic chain                                     */
    /* ================================================================== */

    _buildRobot() {
        const m = this._mats();
        const s = this.seg;

        this.robotRoot = new THREE.Group();
        this.robotRoot.rotation.x = -Math.PI / 2; // Z-up to Y-up
        this.scene.add(this.robotRoot);

        /* ---- FIXED BASE ---- */
        // Mounting plate
        const plate = this._tube(72, 76, 8, m.silver);
        plate.rotation.x = Math.PI / 2;
        plate.position.z = 4;
        this.robotRoot.add(plate);

        // Base column — tapered
        const base = this._tube(48, 65, this.d1 - 10, m.baseGrey);
        base.rotation.x = Math.PI / 2;
        base.position.z = 10 + (this.d1 - 10) / 2;
        this.robotRoot.add(base);

        /* ---- J1: Base rotation (around Z) ---- */
        const j1 = new THREE.Group();
        j1.position.z = this.d1;
        this.robotRoot.add(j1);
        this.jGroups.push(j1);

        // Shoulder housing
        const shoulderBody = this._jointSphere(44, 1.15);
        j1.add(shoulderBody);
        this._addCaps(j1, 30, 40, 8);

        // DH: alpha1 = -PI/2 (rotate frame for J2)
        const frame2 = new THREE.Group();
        frame2.rotation.x = -Math.PI / 2;
        j1.add(frame2);

        /* ---- J2: Shoulder (around Z of rotated frame) ---- */
        const j2 = new THREE.Group();
        j2.userData.thetaOffset = -Math.PI / 2;
        frame2.add(j2);
        this.jGroups.push(j2);

        // J2 housing
        j2.add(this._jointSphere(36, 1.1));
        this._addCaps(j2, 26, 32, 7);

        // Upper arm link
        j2.add(this._armLink(this.a2, 30, 26));

        /* ---- J3: Elbow ---- */
        const frame3 = new THREE.Group();
        frame3.position.x = this.a2;
        j2.add(frame3);

        const j3 = new THREE.Group();
        frame3.add(j3);
        this.jGroups.push(j3);

        // J3 housing
        j3.add(this._jointSphere(30, 1.1));
        this._addCaps(j3, 22, 27, 7);

        // Forearm link
        j3.add(this._armLink(this.a3, 26, 20));

        /* ---- J4: Wrist 1 ---- */
        const frame4pre = new THREE.Group();
        frame4pre.position.x = this.a3;
        j3.add(frame4pre);

        // DH: alpha4 = -PI/2
        const frame4 = new THREE.Group();
        frame4.rotation.x = -Math.PI / 2;
        frame4pre.add(frame4);

        const j4 = new THREE.Group();
        j4.userData.thetaOffset = Math.PI / 2;
        frame4.add(j4);
        this.jGroups.push(j4);

        // J4 housing
        j4.add(this._jointSphere(22, 1.0));
        this._addCaps(j4, 17, 19, 6);

        // Wrist tube along Z to J5
        const wrist1 = this._tube(16, 18, this.d5, m.white);
        wrist1.rotation.x = Math.PI / 2;
        wrist1.position.z = this.d5 / 2;
        j4.add(wrist1);

        /* ---- J5: Wrist 2 ---- */
        const frame5pre = new THREE.Group();
        frame5pre.position.z = this.d5;
        j4.add(frame5pre);

        // DH: alpha5 = PI/2
        const frame5 = new THREE.Group();
        frame5.rotation.x = Math.PI / 2;
        frame5pre.add(frame5);

        const j5 = new THREE.Group();
        frame5.add(j5);
        this.jGroups.push(j5);

        // J5 housing
        j5.add(this._jointSphere(18, 1.0));
        this._addCaps(j5, 14, 15, 5);

        // Wrist tube along Z to flange
        const wrist2 = this._tube(13, 15, this.d6, m.white);
        wrist2.rotation.x = Math.PI / 2;
        wrist2.position.z = this.d6 / 2;
        j5.add(wrist2);

        /* ---- J6: Tool flange ---- */
        const frame6 = new THREE.Group();
        frame6.position.z = this.d6;
        j5.add(frame6);

        const j6 = new THREE.Group();
        frame6.add(j6);
        this.jGroups.push(j6);

        // Flange disc
        const flange = this._tube(18, 20, 6, m.silver);
        flange.rotation.x = Math.PI / 2;
        flange.position.z = 3;
        j6.add(flange);

        // Bolt circle
        if (this.detail >= 2) {
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const bolt = new THREE.Mesh(
                    new THREE.CylinderGeometry(1.5, 1.5, 7, 8),
                    m.darkGrey
                );
                bolt.rotation.x = Math.PI / 2;
                bolt.position.set(Math.cos(a) * 14, Math.sin(a) * 14, 3);
                j6.add(bolt);
            }
        }

        // TCP marker
        const tcpGeo = new THREE.SphereGeometry(4, 8, 6);
        this.tcpMarker = new THREE.Mesh(tcpGeo, m.tcp);
        this.tcpMarker.position.z = 12;
        j6.add(this.tcpMarker);

        // TCP axes
        const ax = new THREE.AxesHelper(35);
        ax.position.z = 12;
        j6.add(ax);
    }

    /* ================================================================== */
    /*  Environment                                                        */
    /* ================================================================== */

    _buildEnvironment() {
        this.scene.add(new THREE.GridHelper(1200, 24, 0x1a3a5a, 0x111a28));
        this.scene.add(new THREE.AxesHelper(150));

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(1200, 1200),
            new THREE.MeshPhongMaterial({ color: 0x0a0e14, transparent: true, opacity: 0.5 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -1;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    /* ================================================================== */
    /*  Mouse orbit                                                        */
    /* ================================================================== */

    _setupControls() {
        const el = this.renderer.domElement;
        el.addEventListener('mousedown', (e) => {
            this.isMouseDown = true;
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });
        el.addEventListener('mousemove', (e) => {
            if (!this.isMouseDown) return;
            this.cameraAngleX += (e.clientX - this.mouseX) * 0.005;
            this.cameraAngleY = Math.max(0.1, Math.min(Math.PI * 0.45,
                this.cameraAngleY - (e.clientY - this.mouseY) * 0.005));
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
            this._updateCameraPosition();
        });
        el.addEventListener('mouseup', () => { this.isMouseDown = false; });
        el.addEventListener('mouseleave', () => { this.isMouseDown = false; });
        el.addEventListener('wheel', (e) => {
            this.cameraDistance = Math.max(200, Math.min(2000,
                this.cameraDistance + e.deltaY * 0.5));
            this._updateCameraPosition();
        });
    }

    _updateCameraPosition() {
        const d = this.cameraDistance;
        const x = d * Math.sin(this.cameraAngleY) * Math.cos(this.cameraAngleX);
        const y = d * Math.cos(this.cameraAngleY);
        const z = d * Math.sin(this.cameraAngleY) * Math.sin(this.cameraAngleX);
        this.camera.position.set(x, y + 200, z);
        this.camera.lookAt(0, 300, 0);
    }

    _onResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (w === 0 || h === 0) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    _animate() {
        requestAnimationFrame(() => this._animate());
        this.renderer.render(this.scene, this.camera);
    }

    /* ================================================================== */
    /*  Joint angle update                                                 */
    /* ================================================================== */

    updateJoints(j1, j2, j3, j4, j5, j6) {
        const D = Math.PI / 180;
        const angles = [j1, j2, j3, j4, j5, j6];
        this._lastAngles = angles;
        for (let i = 0; i < 6; i++) {
            const g = this.jGroups[i];
            if (!g) continue;
            const offset = g.userData.thetaOffset || 0;
            g.rotation.z = angles[i] * D + offset;
        }
    }

    /* ================================================================== */
    /*  TCP helpers                                                         */
    /* ================================================================== */

    getTCPWorldPosition() {
        const p = new THREE.Vector3();
        if (this.tcpMarker) this.tcpMarker.getWorldPosition(p);
        return p;
    }

    addTrailPoint() {
        const p = this.getTCPWorldPosition();
        this.tcpTrail.push(p.clone());
        if (this.tcpTrail.length > 5000) this.tcpTrail.shift();
        this._updateTrailLine();
    }

    clearTrail() {
        this.tcpTrail = [];
        if (this.trailLine) {
            this.scene.remove(this.trailLine);
            this.trailLine = null;
        }
    }

    _updateTrailLine() {
        if (this.trailLine) this.scene.remove(this.trailLine);
        if (this.tcpTrail.length < 2) return;
        const geo = new THREE.BufferGeometry().setFromPoints(this.tcpTrail);
        const mat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 2 });
        this.trailLine = new THREE.Line(geo, mat);
        this.scene.add(this.trailLine);
    }
}

/* Global */
let robot3d = null;

function initRobot3D() {
    robot3d = new Robot3DView('robot3dContainer');
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initRobot3D, 100);
});
