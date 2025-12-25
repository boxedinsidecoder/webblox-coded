import * as THREE from 'three';

export class RemotePlayer {
    constructor(scene, username) {
        this.scene = scene;
        this.username = username;
        this.targetPos = new THREE.Vector3(0, 5, 0);
        this.targetRot = 0;
        this.isMoving = false;
        this.walkTime = 0;

        this.initMesh();
    }

    initMesh() {
        this.group = new THREE.Group();
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0xe74c3c }); // Different color for remote
        const skinMat = new THREE.MeshPhongMaterial({ color: 0xffdbac });
        const pantMat = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });

        this.head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
        this.head.position.y = 1.6;
        this.group.add(this.head);

        this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.4), bodyMat);
        this.torso.position.y = 0.9;
        this.group.add(this.torso);

        const armGeo = new THREE.BoxGeometry(0.3, 0.8, 0.3);
        this.leftArm = new THREE.Mesh(armGeo, skinMat);
        this.leftArm.position.set(-0.55, 1, 0);
        this.group.add(this.leftArm);

        this.rightArm = new THREE.Mesh(armGeo, skinMat);
        this.rightArm.position.set(0.55, 1, 0);
        this.group.add(this.rightArm);

        const legGeo = new THREE.BoxGeometry(0.35, 0.8, 0.35);
        this.leftLeg = new THREE.Mesh(legGeo, pantMat);
        this.leftLeg.position.set(-0.2, 0.4, 0);
        this.group.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(legGeo, pantMat);
        this.rightLeg.position.set(0.2, 0.4, 0);
        this.group.add(this.rightLeg);

        // Nametag
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
        this.nametag.position.y = 2.2;
        this.nametag.scale.set(1.5, 0.375, 1);
        this.group.add(this.nametag);

        this.scene.add(this.group);
    }

    updateTarget(data) {
        if (data.x !== undefined) this.targetPos.set(data.x, data.y, data.z);
        if (data.ry !== undefined) this.targetRot = data.ry;
        this.isMoving = data.moving;
    }

    update(delta) {
        this.group.position.lerp(this.targetPos, 0.2);
        
        // Wrap rotation lerp
        let diff = this.targetRot - this.group.rotation.y;
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        this.group.rotation.y += diff * 0.2;

        if (this.isMoving) {
            this.walkTime += delta * 10;
            const angle = Math.sin(this.walkTime) * 0.5;
            this.leftLeg.rotation.x = angle;
            this.rightLeg.rotation.x = -angle;
            this.leftArm.rotation.x = -angle;
            this.rightArm.rotation.x = angle;
        } else {
            this.walkTime = 0;
            this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, 0.2);
            this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, 0.2);
            this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, 0.2);
            this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, 0.2);
        }
    }

    destroy() {
        this.scene.remove(this.group);
    }
}

