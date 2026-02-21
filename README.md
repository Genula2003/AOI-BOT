# AI CHAMBER - ECHO

A viral "AI living inside my old iPhone" chamber app. Built for iPhone 6s (iOS 15.8 Safari).

## Features
- **3D Robo Face**: Procedural Three.js model with idle breathing, blinking, and micro-saccades.
- **Face Tracking**: Real-time eye tracking using MediaPipe Face Landmarker (throttled for performance).
- **Push-to-Talk**: Voice recording with amplitude-based mouth animation.
- **AI Backend**: Cloudflare Workers + OpenAI (Whisper STT, GPT-3.5 Chat, OpenAI TTS).
- **Memory**: Session-based memory using Cloudflare KV.
- **PWA**: "Add to Home Screen" support for fullscreen experience.

## Deployment Instructions

### 1. Backend (Cloudflare Workers)
1. Go to the `worker` directory.
2. Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) if you haven't already.
3. Create a KV namespace: `npx wrangler kv:namespace create ECHO_KV`.
4. Update `wrangler.toml` with the generated `id`.
5. Set your OpenAI API Key: `npx wrangler secret put OPENAI_API_KEY`.
6. Deploy: `npx wrangler deploy`.
7. Note your worker URL (e.g., `https://echo-backend.your-subdomain.workers.dev`).

### 2. Frontend (GitHub Pages)
1. Go to `web/app.js`.
2. Update the `baseUrl` in the `apiCall` function to your Cloudflare Worker URL.
3. Push the `/web` folder to a GitHub repository.
4. Enable GitHub Pages for that repository (Settings > Pages > Source: Deploy from branch, select `main` and `/web` folder if possible, or just the root if you restructure).
   - *Note: GitHub Pages usually serves from the root. You may need to move files to the root or use a build action.*

### 3. Usage on iPhone
1. Open the GitHub Pages URL in Safari on your iPhone.
2. Tap the **Share** button and select **Add to Home Screen**.
3. Launch "AI CHAMBER" from your home screen.
4. Grant Camera and Microphone permissions when prompted.
5. Hold the "HOLD TO SPEAK" button to talk to ECHO.

## Performance Optimization (iPhone 6s)
- **FPS Throttling**: Face tracking is capped at 12 FPS by default.
- **Pixel Ratio**: Capped at 1.5x to reduce GPU load.
- **Low Perf Mode**: Toggle "PERF" button to drop tracking to 6 FPS and pixel ratio to 1.0x.

## Troubleshooting
- **No Audio on iOS**: Ensure the "Ringer" is not on mute. Safari requires a user gesture (tap) to play audio, which is handled by the initial "HOLD TO SPEAK" interaction.
- **Camera/Mic Permissions**: If denied, go to Settings > Safari > Camera/Microphone and ensure they are allowed for the site.
- **HTTPS Required**: Face tracking and microphone require a secure context (HTTPS).

## Security & Privacy
- Camera frames are processed locally for face tracking and are **never** uploaded.
- Audio is only recorded and sent to the backend when the button is held.
- Memory is stored per-session in Cloudflare KV. Use the "WIPE" button to clear local session data.
