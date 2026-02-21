/**
 * AI CHAMBER - ECHO
 * Main Application Controller
 */

import { FaceScene } from './three-scene.js';
import { FaceTracking } from './face-tracking.js';
import { AudioHandler } from './audio-handler.js';

class App {
    constructor() {
        this.state = 'BOOTING';
        this.perfMode = 'HIGH';

        // UI Elements
        this.el = {
            app: document.getElementById('app'),
            statusText: document.getElementById('status-text'),
            talkBtn: document.getElementById('talk-btn'),
            transcriptContainer: document.getElementById('transcript-container'),
            transcriptContent: document.getElementById('transcript-content'),
            toggleTranscript: document.getElementById('toggle-transcript'),
            clearMemory: document.getElementById('clear-memory'),
            togglePerf: document.getElementById('toggle-perf'),
            bootScreen: document.getElementById('boot-screen')
        };

        this.init();
    }

    async init() {
        console.log('ECHO: Initializing...');

        // Initialize Three.js Scene
        this.scene = new FaceScene();

        // Initialize Face Tracking
        this.tracking = new FaceTracking(this.scene);

        // Initialize Audio Handler
        this.audio = new AudioHandler();

        // Bind UI Events
        this.bindEvents();

        // Simulate Boot Process
        setTimeout(() => {
            this.setState('IDLE');
            this.el.bootScreen.style.opacity = '0';
            setTimeout(() => this.el.bootScreen.style.display = 'none', 1000);
        }, 2000);
    }

    bindEvents() {
        // Push-to-talk logic
        this.el.talkBtn.addEventListener('mousedown', () => this.startListening());
        this.el.talkBtn.addEventListener('mouseup', () => this.stopListening());
        this.el.talkBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startListening();
        });
        this.el.talkBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopListening();
        });

        // Toggle Transcript
        this.el.toggleTranscript.addEventListener('click', () => {
            this.el.transcriptContainer.classList.toggle('hidden');
        });

        // Clear Memory
        this.el.clearMemory.addEventListener('click', () => {
            if (confirm('Wipe ECHO\'s memory?')) {
                localStorage.removeItem('echo_session_id');
                this.addTranscript('SYSTEM', 'Memory wiped.');
            }
        });

        // Toggle Performance
        this.el.togglePerf.addEventListener('click', () => {
            this.perfMode = this.perfMode === 'HIGH' ? 'LOW' : 'HIGH';
            this.el.togglePerf.innerText = `PERF: ${this.perfMode}`;
            this.tracking.setThrottling(this.perfMode === 'HIGH' ? 12 : 6);
            this.scene.setPixelRatio(this.perfMode === 'HIGH' ? 1.5 : 1.0);
        });
    }

    setState(state) {
        this.state = state;
        this.el.app.className = `state-${state.toLowerCase()}`;
        this.el.statusText.innerText = state;
        console.log(`ECHO State: ${state}`);

        if (this.scene) {
            this.scene.setMoodFromState(state);
        }
    }

    async startListening() {
        if (this.state !== 'IDLE') return;
        this.setState('LISTENING');
        try {
            await this.audio.startRecording();
        } catch (err) {
            console.error('Mic error:', err);
            this.setState('IDLE');
            alert('Microphone access denied or error.');
        }
    }

    async stopListening() {
        if (this.state !== 'LISTENING') return;
        this.setState('THINKING');

        const audioBlob = await this.audio.stopRecording();
        if (audioBlob) {
            this.processVoice(audioBlob);
        } else {
            this.setState('IDLE');
        }
    }

    async processVoice(blob) {
        try {
            // 1. STT
            this.addTranscript('USER', '...');
            const text = await this.apiCall('/stt', blob, 'audio/webm');
            this.updateLastTranscript(text);

            // 2. Chat
            const response = await this.apiCall('/chat', { text, sessionId: this.getSessionId() });
            this.addTranscript('ECHO', response.text);
            if (response.mood) {
                this.scene.setMood(response.mood);
            }

            // 3. TTS
            this.setState('SPEAKING');
            const audioBuffer = await this.apiCall('/tts', { text: response.text });

            await this.audio.playResponse(audioBuffer, (amplitude) => {
                this.scene.animateMouth(amplitude);
            });

            this.setState('IDLE');
        } catch (err) {
            console.error('Process error:', err);
            this.addTranscript('ERROR', err.message);
            this.setState('IDLE');
        }
    }

    addTranscript(role, text) {
        const div = document.createElement('div');
        div.className = `msg ${role.toLowerCase()}`;
        div.innerHTML = `<strong>${role}:</strong> ${text}`;
        this.el.transcriptContent.appendChild(div);
        this.el.transcriptContainer.scrollTop = this.el.transcriptContainer.scrollHeight;
    }

    updateLastTranscript(text) {
        const lastMsg = this.el.transcriptContent.querySelector('.user:last-child');
        if (lastMsg) {
            lastMsg.innerHTML = `<strong>USER:</strong> ${text}`;
        }
    }

    getSessionId() {
        let sid = localStorage.getItem('echo_session_id');
        if (!sid) {
            sid = Math.random().toString(36).substring(7);
            localStorage.setItem('echo_session_id', sid);
        }
        return sid;
    }

    async apiCall(endpoint, data, contentType) {
        const baseUrl = window.location.origin.includes('github.io')
            ? 'https://your-worker-subdomain.workers.dev' // Placeholder
            : 'http://localhost:8787';

        const options = {
            method: 'POST',
            body: contentType === 'audio/webm' ? data : JSON.stringify(data),
            headers: {}
        };

        if (contentType !== 'audio/webm') {
            options.headers['Content-Type'] = 'application/json';
        }

        const res = await fetch(`${baseUrl}${endpoint}`, options);
        if (!res.ok) throw new Error('Backend error');

        if (endpoint === '/tts') return await res.arrayBuffer();
        return await res.json();
    }
}

// Start the app
window.addEventListener('DOMContentLoaded', () => {
    window.echoApp = new App();
});
