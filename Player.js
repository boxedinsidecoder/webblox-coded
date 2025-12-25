import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Player {
    constructor(scene, physicsWorld, username, isLocal = false) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.username = username;
        this.isLocal = isLocal;
        
        this.input = { forward: 0, right: 0 };
        this.keys = {};
        this.canJump = false;
        this.animState = 'idle';
        this.isMoving = false;
        this.walkTime = 0;

        // squash/stretch targets
        this.squashTarget = new THREE.Vector3(1, 1, 1);
        this.squashVelocity = new THREE.Vector3(0, 0, 0);

        this.initMesh();
        this.initPhysics();
        this.initAudio();

        if (isLocal) {
            window.addEventListener('keydown', (e) => this.keys[e.code] = true);
            window.addEventListener('keyup', (e) => this.keys[e.code] = false);
        }
    }

    initMesh() {
        // Replace the multi-part humanoid with a single cube player mesh
        const cubeSize = 1.2;
        const mat = new THREE.MeshPhongMaterial({ color: 0x3498db });
        this.mesh = new THREE.Mesh(new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize), mat);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);

        // Keep a simple nametag above the cube
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.username, 128, 45);
        
        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: tex });
        this.nametag = new THREE.Sprite(spriteMat);
        this.nametag.position.y = cubeSize * 0.9 + 0.6;
        this.nametag.scale.set(1.5, 0.375, 1);
        // Attach nametag as separate object but keep position relative to mesh in update
        this.scene.add(this.nametag);
    }

    initPhysics() {
        // Use a sphere for collisions so movement feels circular around the player
        const radius = 0.6;
        const shape = new CANNON.Sphere(radius);
        this.body = new CANNON.Body({
            mass: 1,
            shape: shape,
            fixedRotation: true,
            position: new CANNON.Vec3(0, 5, 0),
            linearDamping: 0.1
        });
        
        this.body.addEventListener('collide', (e) => {
            const contact = e.contact;
            // contact.ni can point either way depending on which body is reported as i/j.
            // Consider the absolute Y component so ground contacts are detected reliably.
            if (Math.abs(contact.ni.y) > 0.5) {
                // landing squash
                if (!this.canJump) {
                    this.playSound('land');
                    // strong squash on landing: flatten vertically, widen horizontally
                    this.squashTarget.set(1.2, 0.7, 1.2);
                }
                this.canJump = true;
            }
        });

        this.physicsWorld.addBody(this.body);
    }

    initAudio() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.sounds = {};
        ['jump', 'land', 'step'].forEach(name => {
            fetch(`${name}.mp3`).then(r => r.arrayBuffer()).then(buf => {
                this.audioCtx.decodeAudioData(buf, decoded => this.sounds[name] = decoded);
            });
        });
    }

    playSound(name) {
        if (!this.sounds[name]) return;
        const source = this.audioCtx.createBufferSource();
        source.buffer = this.sounds[name];
        source.connect(this.audioCtx.destination);
        source.start(0);
    }

    setInput(forward, right) {
        this.input.forward = forward;
        this.input.right = right;
    }

    jump() {
        if (this.canJump) {
            this.body.velocity.y = 12; // stronger jump impulse
            this.canJump = false;
            this.playSound('jump');
            // stretch when launching up: taller and narrower
            this.squashTarget.set(0.85, 1.25, 0.85);
        }
    }

    update(delta, camera) {
        if (this.isLocal) {
            this.updateFromKeyboard();
        }

        const moveSpeed = 14; // increased for snappier movement

        // Determine camera-relative movement direction (ignore camera pitch)
        const camForward = new THREE.Vector3();
        camera.getWorldDirection(camForward);
        camForward.y = 0;
        camForward.normalize();

        const camRight = new THREE.Vector3();
        camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

        let moveVec = new THREE.Vector3(0, 0, 0);

        if (Math.abs(this.input.forward) > 0.01 || Math.abs(this.input.right) > 0.01) {
            moveVec.addScaledVector(camForward, this.input.forward);
            moveVec.addScaledVector(camRight, this.input.right);
            moveVec.normalize().multiplyScalar(moveSpeed);
            this.isMoving = true;

            // Rotate player to face movement direction
            const targetYaw = Math.atan2(moveVec.x, moveVec.z);
            // Smoothly interpolate rotation towards target yaw
            const currentYaw = this.mesh.rotation.y;
            let diff = targetYaw - currentYaw;
            if (diff > Math.PI) diff -= Math.PI * 2;
            if (diff < -Math.PI) diff += Math.PI * 2;
            this.mesh.rotation.y += diff * 0.25; // interpolation factor

            // movement-based subtle squash: more horizontal stretch at higher speed
            const speed = Math.sqrt(moveVec.x * moveVec.x + moveVec.z * moveVec.z);
            const t = Math.min(speed / moveSpeed, 1);
            const horiz = 1 + 0.12 * t; // widen when moving
            const vert = 1 - 0.08 * t;  // slightly shorter
            // bias current squash target more aggressively so movement squash responds faster
            this.squashTarget.lerp(new THREE.Vector3(horiz, vert, horiz), 0.18);
        } else {
            this.isMoving = false;
            moveVec.set(0, 0, 0);
            // relax movement squash back to neutral faster
            this.squashTarget.lerp(new THREE.Vector3(1,1,1), 0.12);
        }

        this.body.velocity.x = moveVec.x;
        this.body.velocity.z = moveVec.z;

        // Sync mesh to physics
        this.mesh.position.copy(this.body.position);
        
        this.animateModel(delta);

        // Teleport back if fallen
        if (this.body.position.y < -10) {
            this.body.position.set(0, 10, 0);
            this.body.velocity.set(0, 0, 0);
        }
    }

    updateFromKeyboard() {
        this.input.forward = 0;
        this.input.right = 0;
        if (this.keys['KeyW']) this.input.forward = 1;
        if (this.keys['KeyS']) this.input.forward = -1;
        if (this.keys['KeyA']) this.input.right = -1;
        if (this.keys['KeyD']) this.input.right = 1;
    }

    animateModel(delta) {
        // Remove bobbing/idle movement animations; keep player visually synced to physics
        this.mesh.position.y = this.body.position.y;
        this.mesh.rotation.x = 0; // no tilt from walking

        // Add a subtle sway (roll) when turning left/right
        const turnLeft = this.keys && this.keys['KeyA'];
        const turnRight = this.keys && this.keys['KeyD'];
        const targetSway = turnLeft ? 0.15 : (turnRight ? -0.15 : 0);
        this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, targetSway, 0.3);

        // Apply squash/stetch smoothing: lerp mesh.scale towards squashTarget
        // also factor vertical velocity to add dynamic stretch while airborne
        const vy = this.body.velocity.y;
        // small dynamic stretch while rising/falling: stretch when moving quickly up or down
        const airStretch = THREE.MathUtils.clamp(1 - vy * 0.02, 0.85, 1.15);
        const desired = this.squashTarget.clone();
        // when airborne (not allowed to jump), bias towards vertical stretch based on vy
        if (!this.canJump) {
            desired.y = desired.y * airStretch;
            desired.x = desired.x * (2 - airStretch) * 0.5 + desired.x * 0.5;
            desired.z = desired.z * (2 - airStretch) * 0.5 + desired.z * 0.5;
        }
        // smooth interpolation (sped up so squish/squash feels snappier)
        this.mesh.scale.lerp(desired, 0.35);

        // Gradually decay squash target back to neutral when near-neutral to avoid permanent offsets
        if (this.squashTarget.distanceTo(new THREE.Vector3(1,1,1)) < 0.02) {
            // when almost neutral, snap back quicker
            this.squashTarget.lerp(new THREE.Vector3(1,1,1), 0.5);
        } else {
            // otherwise decay faster than before for snappier response
            this.squashTarget.lerp(new THREE.Vector3(1,1,1), 0.12);
        }

        // Keep nametag above the cube (account for vertical scale)
        if (this.nametag) {
            this.nametag.position.x = this.mesh.position.x;
            this.nametag.position.z = this.mesh.position.z;
            const halfHeight = (this.mesh.geometry.parameters.height ? this.mesh.geometry.parameters.height / 2 : 0.6) * this.mesh.scale.y;
            this.nametag.position.y = this.mesh.position.y + halfHeight + 0.6;
        }
    }
}

