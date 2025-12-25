import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class World {
    constructor(scene, physicsWorld) {
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.init();
    }

    init() {
        // Ground
        const groundSize = 100;
        const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
        const groundMat = new THREE.MeshPhongMaterial({ color: 0x2ecc71 });
        const groundMesh = new THREE.Mesh(groundGeo, groundMat);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;
        this.scene.add(groundMesh);

        const groundBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Plane(),
        });
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.physicsWorld.addBody(groundBody);

        // Add some platforms
        this.createBox(5, 1, 5, 0, 0.5, 0, 0x27ae60);
        this.createBox(4, 1, 4, 10, 2, 5, 0xf1c40f);
        this.createBox(4, 1, 4, 15, 4, -5, 0xe67e22);
        this.createBox(3, 1, 3, 20, 6, 0, 0xe74c3c);
        this.createBox(3, 1, 3, 25, 8, 10, 0x9b59b6);
        this.createBox(10, 1, 10, 35, 10, 0, 0x34495e); // Big goal platform

        // Random obstacles/decoration
        for (let i = 0; i < 20; i++) {
            const x = (Math.random() - 0.5) * 80;
            const z = (Math.random() - 0.5) * 80;
            if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;
            this.createBox(2, 2, 2, x, 1, z, 0x95a5a6);
        }
    }

    createBox(w, h, d, x, y, z, color) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshPhongMaterial({ color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        const shape = new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2));
        const body = new CANNON.Body({
            mass: 0,
            shape: shape,
            position: new CANNON.Vec3(x, y, z)
        });
        this.physicsWorld.addBody(body);
    }
}

