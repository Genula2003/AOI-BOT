import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class FaceScene {
    constructor() {
        this.container = document.body;
        this.canvas = document.getElementById('face-canvas');

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance'
        });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

        this.camera.position.z = 5;

        this.initLights();
        this.buildFace();

        this.lookTarget = new THREE.Vector3(0, 0, 2.5);
        this.smoothTarget = new THREE.Vector3(0, 0, 2.5);

        this.mood = 'CALM';
        this.blinkTimer = 0;
        this.saccadeTimer = 0;
        this.saccadeOffset = new THREE.Vector3(0, 0, 0);

        window.addEventListener('resize', () => this.onResize());
        this.animate();
    }

    initLights() {
        const ambientLight = new THREE.AmbientLight(0x404040, 2);
        this.scene.add(ambientLight);

        this.spotLight = new THREE.SpotLight(0xa855f7, 5);
        this.spotLight.position.set(2, 2, 5);
        this.scene.add(this.spotLight);
    }

    buildFace() {
        this.faceGroup = new THREE.Group();
        this.scene.add(this.faceGroup);

        // Head
        const headGeo = new THREE.SphereGeometry(1, 32, 32);
        const headMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.9,
            roughness: 0.1
        });
        this.head = new THREE.Mesh(headGeo, headMat);
        this.faceGroup.add(this.head);

        // Eyes Group
        this.eyesGroup = new THREE.Group();
        this.faceGroup.add(this.eyesGroup);

        const eyeGeo = new THREE.SphereGeometry(0.15, 16, 16);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });

        this.eyeL = new THREE.Mesh(eyeGeo, eyeMat.clone());
        this.eyeL.position.set(-0.4, 0.2, 0.85);
        this.eyesGroup.add(this.eyeL);

        this.eyeR = new THREE.Mesh(eyeGeo, eyeMat.clone());
        this.eyeR.position.set(0.4, 0.2, 0.85);
        this.eyesGroup.add(this.eyeR);

        // Mouth
        const mouthGeo = new THREE.BoxGeometry(0.4, 0.05, 0.1);
        const mouthMat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
        this.mouth = new THREE.Mesh(mouthGeo, mouthMat);
        this.mouth.position.set(0, -0.4, 0.9);
        this.faceGroup.add(this.mouth);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    setPixelRatio(ratio) {
        this.renderer.setPixelRatio(ratio);
    }

    updateLookAt(x, y) {
        // Deprecated: now uses window.ECHO_FACE in animate()
    }

    setMoodFromState(state) {
        let color = 0xa855f7; // IDLE (Purple)
        if (state === 'LISTENING') color = 0xef4444; // Red
        if (state === 'THINKING') color = 0x3b82f6; // Blue
        if (state === 'SPEAKING') color = 0x10b981; // Green

        this.setFaceColor(color);
    }

    setMood(mood) {
        let color = 0xa855f7;
        switch(mood) {
            case 'curious': color = 0x3b82f6; break;
            case 'suspicious': color = 0xf59e0b; break;
            case 'proud': color = 0x10b981; break;
            case 'tired': color = 0x6b7280; break;
            case 'calm': color = 0xa855f7; break;
        }
        this.setFaceColor(color);
    }

    setFaceColor(color) {
        this.eyeL.material.color.setHex(color);
        this.eyeR.material.color.setHex(color);
        this.mouth.material.color.setHex(color);
        this.spotLight.color.setHex(color);
    }

    animateMouth(amplitude) {
        const scale = 1 + (amplitude / 255) * 5;
        this.mouth.scale.y = scale;
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const time = performance.now() * 0.001;

        // 1. Handle Face Following / Search Mode
        if (window.ECHO_FACE && window.ECHO_FACE.hasFace) {
            const { x, y } = window.ECHO_FACE;
            // Map normalized [0, 1] to 3D space.
            // x: 0.5 is center, so (x-0.5)*4 gives range [-2, 2]
            this.lookTarget.set((x - 0.5) * 4, -(y - 0.5) * 4, 2.5);
        } else {
            // Search Mode: slow horizontal scan
            this.lookTarget.x = Math.sin(time * 0.5) * 2;
            this.lookTarget.y = Math.sin(time * 0.2) * 0.5;
            this.lookTarget.z = 2.5;
        }

        // 2. Micro-saccades (tiny eye flicks)
        this.saccadeTimer -= 0.016;
        if (this.saccadeTimer <= 0) {
            this.saccadeOffset.set(
                (Math.random() - 0.5) * 0.2,
                (Math.random() - 0.5) * 0.2,
                0
            );
            this.saccadeTimer = 0.5 + Math.random() * 1.5;
        }

        // 3. Smoothing
        const finalTarget = this.lookTarget.clone().add(this.saccadeOffset);
        this.smoothTarget.lerp(finalTarget, 0.1);

        // 4. Eyes LookAt
        // We use world position for lookAt
        const worldTarget = this.smoothTarget.clone();
        this.eyeL.lookAt(worldTarget);
        this.eyeR.lookAt(worldTarget);

        // 5. Head follows slightly (15%)
        this.head.rotation.y = (this.smoothTarget.x / 4) * 0.15;
        this.head.rotation.x = -(this.smoothTarget.y / 4) * 0.1;

        // 6. Idle breathing / sway
        this.faceGroup.position.y = Math.sin(time * 0.5) * 0.1;
        this.faceGroup.rotation.z = Math.sin(time * 0.3) * 0.02;

        // 7. Random Blinking
        this.blinkTimer -= 0.016;
        if (this.blinkTimer <= 0) {
            this.blink();
            this.blinkTimer = 2 + Math.random() * 5;
        }

        this.renderer.render(this.scene, this.camera);
    }

    blink() {
        let start = performance.now();
        const duration = 150;

        const animateBlink = (now) => {
            const progress = (now - start) / duration;
            if (progress < 0.5) {
                this.eyeL.scale.y = this.eyeR.scale.y = 1 - (progress * 2);
            } else if (progress < 1.0) {
                this.eyeL.scale.y = this.eyeR.scale.y = (progress - 0.5) * 2;
            } else {
                this.eyeL.scale.y = this.eyeR.scale.y = 1;
                return;
            }
            requestAnimationFrame(animateBlink);
        };
        requestAnimationFrame(animateBlink);
    }
}
