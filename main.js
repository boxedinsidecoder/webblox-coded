import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import nipplejs from 'nipplejs';
import { Player } from './Player.js';
import { World } from './World.js';
import { RemotePlayer } from './RemotePlayer.js';

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        this.physicsWorld = new CANNON.World();
        this.physicsWorld.gravity.set(0, -20, 0);

        this.world = new World(this.scene, this.physicsWorld);
        this.player = null;
        this.remotePlayers = new Map();
        this.room = null;

        // Camera control state for right-click rotate (now supports pitch)
        this.cameraYaw = 0; // horizontal yaw from dragging
        this.cameraPitch = 0; // vertical pitch from dragging (radians)
        this.isRotatingCamera = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.cameraRotateSensitivity = 0.005;
        this.cameraPitchSensitivity = 0.004;
        // Clamp pitch to avoid flipping the camera
        this.cameraPitchMin = -1.2; // look down limit (~-69 deg)
        this.cameraPitchMax = 0.6;  // look up limit (~34 deg)

        this.initLights();
        this.initMultiplayer();
        this.initControls();

        window.addEventListener('resize', () => this.onResize());
        this.animate();
    }

    initLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.position.set(10, 20, 10);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 1024;
        sun.shadow.mapSize.height = 1024;
        sun.shadow.camera.left = -50;
        sun.shadow.camera.right = 50;
        sun.shadow.camera.top = 50;
        sun.shadow.camera.bottom = -50;
        this.scene.add(sun);
    }

    async initMultiplayer() {
        this.room = new WebsimSocket();
        await this.room.initialize();

        const myId = this.room.clientId;
        const myPeer = this.room.peers[myId];
        
        this.player = new Player(this.scene, this.physicsWorld, myPeer.username, true);
        this.player.id = myId;

        this.room.subscribePresence((presence) => {
            document.getElementById('player-count').innerText = Object.keys(presence).length;
            
            for (const id in presence) {
                if (id === myId) continue;
                
                const data = presence[id];
                if (!this.remotePlayers.has(id) && this.room.peers[id]) {
                    const rp = new RemotePlayer(this.scene, this.room.peers[id].username);
                    this.remotePlayers.set(id, rp);
                }
                
                const rp = this.remotePlayers.get(id);
                if (rp) {
                    rp.updateTarget(data);
                }
            }

            // Cleanup disconnected
            for (const [id, rp] of this.remotePlayers) {
                if (!presence[id]) {
                    rp.destroy();
                    this.remotePlayers.delete(id);
                }
            }
        });

        // Broadcast presence periodically
        setInterval(() => {
            if (this.player) {
                this.room.updatePresence({
                    x: this.player.mesh.position.x,
                    y: this.player.mesh.position.y,
                    z: this.player.mesh.position.z,
                    ry: this.player.mesh.rotation.y,
                    anim: this.player.animState,
                    moving: this.player.isMoving
                });
            }
        }, 50);
    }

    initControls() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            document.getElementById('jump-button').style.display = 'flex';
            const joystick = nipplejs.create({
                zone: document.getElementById('joystick-container'),
                mode: 'static',
                position: { left: '60px', bottom: '60px' },
                color: 'white'
            });

            joystick.on('move', (evt, data) => {
                if (this.player) {
                    const forward = data.vector.y;
                    const right = data.vector.x;
                    this.player.setInput(forward, right);
                }
            });

            joystick.on('end', () => {
                if (this.player) this.player.setInput(0, 0);
            });

            document.getElementById('jump-button').addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (this.player) this.player.jump();
            });
        }

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') this.player?.jump();
        });

        // Mouse controls for right-click camera rotation (now handles pitch)
        const canvas = this.renderer.domElement;
        // Prevent default context menu so right-click is usable
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 2) { // right mouse button
                this.isRotatingCamera = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 2) {
                this.isRotatingCamera = false;
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isRotatingCamera) return;
            const dx = e.clientX - this.lastMouseX;
            const dy = e.clientY - this.lastMouseY;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            this.cameraYaw -= dx * this.cameraRotateSensitivity;
            this.cameraPitch -= dy * this.cameraPitchSensitivity;

            // Clamp pitch so camera can't flip over
            this.cameraPitch = Math.max(this.cameraPitchMin, Math.min(this.cameraPitchMax, this.cameraPitch));
        });
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        const delta = 1 / 60;
        this.physicsWorld.step(delta);

        if (this.player) {
            this.player.update(delta, this.camera);
            
            // Third person camera follow with adjustable yaw & pitch from right-click drag
            const idealOffset = new THREE.Vector3(0, 5, 10);

            // Use camera yaw/pitch only for camera rotation so player's rotation (from strafing) doesn't rotate the camera
            const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), this.cameraYaw);
            const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), this.cameraPitch);

            // Combine yaw then pitch; do NOT include player rotation
            const offsetQuat = yawQuat.clone().multiply(pitchQuat);

            // compute camera position and lookAt using offsetQuat
            const finalOffset = idealOffset.clone().applyQuaternion(offsetQuat).add(this.player.mesh.position);
            this.camera.position.copy(finalOffset);

            // Compute lookAt point: slightly above player, rotated by yaw and pitch appropriately
            const lookAtLocal = new THREE.Vector3(0, 2, 0).applyQuaternion(offsetQuat).add(this.player.mesh.position);
            this.camera.lookAt(lookAtLocal);
        }

        // Update remote players
        this.remotePlayers.forEach(rp => rp.update(delta));

        this.renderer.render(this.scene, this.camera);
    }
}

new Game();

