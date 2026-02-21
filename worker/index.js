/**
 * ECHO AI Backend - Cloudflare Worker
 */

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
            "Access-Control-Max-Age": "86400",
            "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers"),
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            if (url.pathname === "/stt" && request.method === "POST") {
                return await handleSTT(request, env, corsHeaders);
            }
            if (url.pathname === "/chat" && request.method === "POST") {
                return await handleChat(request, env, corsHeaders);
            }
            if (url.pathname === "/tts" && request.method === "POST") {
                return await handleTTS(request, env, corsHeaders);
            }

            return new Response("Not Found", { status: 404, headers: corsHeaders });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }
    }
};

async function handleSTT(request, env, corsHeaders) {
    const formData = new FormData();
    const blob = await request.blob();
    formData.append("file", blob, "audio.webm");
    formData.append("model", "whisper-1");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
        body: formData
    });

    const data = await response.json();
    return new Response(JSON.stringify({ text: data.text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

async function handleChat(request, env, corsHeaders) {
    const { text, sessionId } = await request.json();

    // 1. Get Memory from KV
    let memory = [];
    if (env.ECHO_KV) {
        const stored = await env.ECHO_KV.get(`session_${sessionId}`);
        if (stored) memory = JSON.parse(stored);
    }

    // 2. Prepare Messages
    const systemPrompt = `You are ECHO, a calm, observant, slightly cryptic sci-fi AI living inside an iPhone.
    Personality: Premium, cinematic, not goofy. Use short lines.
    Current Date: ${new Date().toUTCString()}.
    Respond in JSON format: { "text": "your response", "mood": "curious|calm|suspicious|proud|tired" }`;

    const messages = [
        { role: "system", content: systemPrompt },
        ...memory,
        { role: "user", content: text }
    ];

    // 3. Call OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: messages,
            response_format: { type: "json_object" }
        })
    });

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);

    // 4. Update Memory
    memory.push({ role: "user", content: text });
    memory.push({ role: "assistant", content: result.text });
    // Keep last 10 interactions
    if (memory.length > 10) memory = memory.slice(-10);

    if (env.ECHO_KV) {
        await env.ECHO_KV.put(`session_${sessionId}`, JSON.stringify(memory));
    }

    return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

async function handleTTS(request, env, corsHeaders) {
    const { text } = await request.json();

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "tts-1",
            input: text,
            voice: "nova"
        })
    });

    const audio = await response.arrayBuffer();
    return new Response(audio, {
        headers: { ...corsHeaders, "Content-Type": "audio/mpeg" }
    });
}
