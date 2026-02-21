/**
 * Face Tracking Module
 * Uses MediaPipe Face Landmarker (throttled)
 */

export class FaceTracking {
    constructor(scene) {
        this.scene = scene;
        this.video = document.getElementById('webcam');
        this.faceLandmarker = null;
        this.lastVideoTime = -1;
        this.throttlingMs = 80; // ~12 FPS
        this.lastProcessedTime = 0;

        this.init();
    }

    async init() {
        try {
            // Import MediaPipe from CDN
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
            this.startCamera();
        } catch (err) {
            console.error("ECHO: Face Tracking init failed:", err);
        }
    }

    async startCamera() {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "user", width: 640, height: 480 },
                    audio: false
                });
                this.video.srcObject = stream;
                this.video.addEventListener('loadeddata', () => this.predictLoop());
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

        if (this.video.currentTime !== this.lastVideoTime && (now - this.lastProcessedTime) >= this.throttlingMs) {
            this.lastVideoTime = this.video.currentTime;
            this.lastProcessedTime = now;

            const result = this.faceLandmarker.detectForVideo(this.video, now);

            if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                const landmarks = result.faceLandmarks[0];
                // Use nose tip (index 1) for center estimation
                const nose = landmarks[1];

                // Map to range [-1, 1]
                const x = (nose.x - 0.5) * 2;
                const y = -(nose.y - 0.5) * 2;

                this.scene.updateLookAt(-x, y); // Invert X for mirror effect
            } else {
                // Face lost - return to neutral slowly
                this.scene.updateLookAt(0, 0);
            }
        }

        requestAnimationFrame(() => this.predictLoop());
    }
}
