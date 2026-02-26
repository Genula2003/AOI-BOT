/**
 * Audio Handler Module
 * Manages microphone recording and response playback
 */

export class AudioHandler {
    constructor() {
        this.audioContext = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.analyser = null;
        this.dataArray = null;
        this.source = null;
        this.isPlaying = false;
    }

    async startRecording() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(stream);
        this.audioChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
            this.audioChunks.push(event.data);
        };

        this.mediaRecorder.start();
    }

    stopRecording() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder) return resolve(null);
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                resolve(audioBlob);
            };
            this.mediaRecorder.stop();
        });
    }

    async playResponse(arrayBuffer, onAmplitude) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

        this.source = this.audioContext.createBufferSource();
        this.source.buffer = audioBuffer;

        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;
        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);

        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);

        this.isPlaying = true;
        this.source.start(0);

        return new Promise((resolve) => {
            const updateAmplitude = () => {
                if (!this.isPlaying) return;

                this.analyser.getByteFrequencyData(this.dataArray);

                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += this.dataArray[i];
                }
                const average = sum / bufferLength;

                onAmplitude(average);
                requestAnimationFrame(updateAmplitude);
            };

            this.source.onended = () => {
                this.isPlaying = false;
                onAmplitude(0);
                resolve();
            };

            updateAmplitude();
        });
    }
}
