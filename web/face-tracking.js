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

        this.smoothX = 0;
        this.smoothY = 0;
        this.lerpFactor = 0.15;

        this.lastLogTime = 0;

        this.init();
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

                // Ensure video is playing
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

    setThrottling(fps) {
        this.throttlingMs = 1000 / fps;
    }

    predictLoop() {
        const now = performance.now();

        // 1. Throttle detection
        if (this.video.readyState >= 2 && (now - this.lastDetectTime) >= this.throttlingMs) {
            this.lastDetectTime = now;

            const result = this.faceLandmarker.detectForVideo(this.video, now);

            if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                const landmarks = result.faceLandmarks[0];
                // Use nose tip (index 1)
                const nose = landmarks[1];

                // Map to range [-1, 1] and invert X for mirror
                const targetX = -(nose.x - 0.5) * 2;
                const targetY = -(nose.y - 0.5) * 2;

                // 2. Exponential smoothing
                this.smoothX += (targetX - this.smoothX) * this.lerpFactor;
                this.smoothY += (targetY - this.smoothY) * this.lerpFactor;

                this.scene.updateLookAt(this.smoothX, this.smoothY);

                // 3. Emit face data
                window.ECHO_FACE = { x: this.smoothX, y: this.smoothY, hasFace: true };

                // 4. Log once per second
                if (now - this.lastLogTime > 1000) {
                    console.log("ECHO: Face detected");
                    this.lastLogTime = now;
                }
            } else {
                // Face lost
                this.smoothX *= 0.9; // Drift back to center
                this.smoothY *= 0.9;
                this.scene.updateLookAt(this.smoothX, this.smoothY);

                window.ECHO_FACE = { hasFace: false };

                if (now - this.lastLogTime > 1000) {
                    console.log("ECHO: No face");
                    this.lastLogTime = now;
                }
            }
        }

        requestAnimationFrame(() => this.predictLoop());
    }
}
