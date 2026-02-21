/**
 * Face Tracking Module
 * Uses MediaPipe Face Landmarker (throttled)
 */

export class FaceTracking {
    constructor(scene) {
        this.scene = scene;
        this.video = document.getElementById('webcam');
        this.faceLandmarker = null;
        this.lastDetectTime = 0;
        this.throttlingMs = 85; // ~11.7 FPS

        this.smoothX = 0.5;
        this.smoothY = 0.5;
        this.lerpFactor = 0.15;

        this.lastLogTime = 0;

        // Debug Overlay
        this.createDebugOverlay();

        this.init();
    }

    createDebugOverlay() {
        this.debugOverlay = document.createElement('div');
        this.debugOverlay.id = 'face-debug';
        this.debugOverlay.style.position = 'fixed';
        this.debugOverlay.style.top = '0';
        this.debugOverlay.style.left = '0';
        this.debugOverlay.style.width = '100%';
        this.debugOverlay.style.height = '100%';
        this.debugOverlay.style.pointerEvents = 'none';
        this.debugOverlay.style.zIndex = '9999';

        this.debugDot = document.createElement('div');
        this.debugDot.style.width = '20px';
        this.debugDot.style.height = '20px';
        this.debugDot.style.borderRadius = '50%';
        this.debugDot.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
        this.debugDot.style.position = 'absolute';
        this.debugDot.style.transform = 'translate(-50%, -50%)';
        this.debugDot.style.display = 'none';

        this.debugText = document.createElement('div');
        this.debugText.style.position = 'absolute';
        this.debugText.style.top = '10px';
        this.debugText.style.left = '10px';
        this.debugText.style.color = 'red';
        this.debugText.style.fontFamily = 'monospace';
        this.debugText.style.fontSize = '12px';
        this.debugText.innerText = 'NO FACE';

        this.debugOverlay.appendChild(this.debugDot);
        this.debugOverlay.appendChild(this.debugText);
        document.body.appendChild(this.debugOverlay);
    }

    async init() {
        try {
            const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs');
            const { FaceLandmarker, FilesetResolver } = vision;

            const filesetResolver = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
            );

            this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                    delegate: "GPU"
                },
                outputFaceBlendshapes: false,
                runningMode: "VIDEO",
                numFaces: 1
            });

            console.log("ECHO: Face Landmarker loaded.");
            await this.startCamera();
        } catch (err) {
            console.error("ECHO: Face Tracking init failed:", err);
        }
    }

    async startCamera() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: "user",
                        width: { ideal: 640 },
                        height: { ideal: 480 }
                    },
                    audio: false
                });
                this.video.srcObject = stream;

                await new Promise((resolve) => {
                    this.video.onloadedmetadata = () => {
                        this.video.play().then(resolve);
                    };
                });

                console.log("ECHO: Camera started.");
                this.predictLoop();
            } catch (err) {
                console.error("Camera access denied:", err);
            }
        }
    }

    predictLoop() {
        const now = performance.now();

        if (this.video.readyState >= 2 && (now - this.lastDetectTime) >= this.throttlingMs) {
            this.lastDetectTime = now;

            const result = this.faceLandmarker.detectForVideo(this.video, now);

            if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                const landmarks = result.faceLandmarks[0];
                const nose = landmarks[1];

                // Normalized x, y [0, 1]
                // Invert X because it's a mirror
                const x = 1.0 - nose.x;
                const y = nose.y;

                window.ECHO_FACE = { x, y, hasFace: true, t: Date.now() };

                // Update Debug Overlay
                this.debugDot.style.display = 'block';
                this.debugDot.style.left = `${x * window.innerWidth}px`;
                this.debugDot.style.top = `${y * window.innerHeight}px`;
                this.debugText.innerText = `FACE: ${x.toFixed(2)}, ${y.toFixed(2)}`;

                if (now - this.lastLogTime > 1000) {
                    console.log(`ECHO: Face detected - x: ${x.toFixed(2)}, y: ${y.toFixed(2)}`);
                    this.lastLogTime = now;
                }
            } else {
                window.ECHO_FACE = { hasFace: false, t: Date.now() };

                this.debugDot.style.display = 'none';
                this.debugText.innerText = 'NO FACE';

                if (now - this.lastLogTime > 1000) {
                    console.log("ECHO: No face");
                    this.lastLogTime = now;
                }
            }
        }

        requestAnimationFrame(() => this.predictLoop());
    }
}
