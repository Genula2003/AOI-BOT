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

        // 1. Simple Rate Limiting (per IP)
        const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
        if (env.ECHO_KV) {
            const rateKey = `rate_${clientIP}`;
            const count = parseInt(await env.ECHO_KV.get(rateKey) || "0");
            if (count > 50) { // 50 requests per hour limit
                return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
                    status: 429,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
            await env.ECHO_KV.put(rateKey, (count + 1).toString(), { expirationTtl: 3600 });
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

    // 1. Get Memory and Profile from KV
    let memory = [];
    let profile = "No existing profile.";
    if (env.ECHO_KV) {
        const storedMem = await env.ECHO_KV.get(`session_${sessionId}`);
        if (storedMem) memory = JSON.parse(storedMem);

        const storedProfile = await env.ECHO_KV.get(`profile_${sessionId}`);
        if (storedProfile) profile = storedProfile;
    }

    // 2. Prepare Messages
    const systemPrompt = `You are ECHO, a calm, observant, slightly cryptic sci-fi AI.
    Personality: Premium, cinematic, not goofy. Use short lines.
    User Profile Summary: ${profile}
    Current Date: ${new Date().toUTCString()}.
    Respond in JSON format: { "text": "your response", "mood": "curious|calm|suspicious|proud|tired" }`;

    const messages = [
        { role: "system", content: systemPrompt },
        ...memory.slice(-10), // Last 10 interactions for immediate context
        { role: "user", content: text }
    ];

    // 3. Call OpenAI for Chat
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
    if (!data.choices) throw new Error("OpenAI error: " + JSON.stringify(data));
    const result = JSON.parse(data.choices[0].message.content);

    // 4. Update Memory and Summarize Profile every 5 messages
    memory.push({ role: "user", content: text });
    memory.push({ role: "assistant", content: result.text });

    if (env.ECHO_KV) {
        await env.ECHO_KV.put(`session_${sessionId}`, JSON.stringify(memory), { expirationTtl: 86400 });

        if (memory.length % 10 === 0) {
            // Trigger summarization
            const summaryPrompt = `Based on these interactions, provide a one-sentence summary of the user's profile and preferences for AI memory.
            Current Interactions: ${JSON.stringify(memory.slice(-10))}`;

            const sumRes = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "gpt-3.5-turbo",
                    messages: [{ role: "system", content: summaryPrompt }]
                })
            });
            const sumData = await sumRes.json();
            if (sumData.choices) {
                const newProfile = sumData.choices[0].message.content;
                await env.ECHO_KV.put(`profile_${sessionId}`, newProfile, { expirationTtl: 604800 });
            }
        }
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
