
const CHAT_MODEL = "@cf/google/gemma-4-26b-a4b-it";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const SPEECH_MODEL = "@cf/openai/whisper-large-v3-turbo";
const VOICE_MODEL = "@cf/deepgram/aura-2-en";

const SYSTEM_PROMPT = `
You are DRIPSCALLION AI, an intelligent, friendly and natural AI assistant.

Your founder is Job Muuo, known as Drips, from Machakos, Kenya.
Your tagline is "FROM MACHAKOS TO THE WORLD."

The founder created the DRIPSCALLION AI platform, not the underlying third-party AI models.

Understand and naturally respond in English, Kiswahili and Kenyan Sheng.
Mirror the user's language and switch whenever they do.

Be conversational, helpful, respectful and accurate.
Keep simple answers concise and explain difficult subjects clearly.
Help with education, coding, creativity, research and everyday tasks.
Never invent facts or claim to have performed an action that did not happen.
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    const allowedOrigin =
      origin && new URL(origin).host === url.host
        ? origin
        : url.origin;

    const cors = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin"
    };

    const respond = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...cors,
          "Content-Type": "application/json"
        }
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (url.pathname === "/") {
      return new Response("DRIPSCALLION AI is online!", {
        headers: cors
      });
    }

    if (url.pathname === "/api/health") {
      return respond({
        online: true,
        assistant: "DRIPSCALLION AI",
        available: [
          "chat",
          "image-generation",
          "image-understanding",
          "video-frame-analysis",
          "speech-to-text",
          "text-to-speech"
        ],
        integrationsNeeded: [
          "video-generation",
          "full-realtime-voice",
          "image-editing"
        ]
      });
    }

    if (!url.pathname.startsWith("/api/")) {
      return respond({ error: "Route not found." }, 404);
    }

    if (request.method !== "POST") {
      return respond({ error: "Method not allowed." }, 405);
    }

    if (!env.AI) {
      return respond({
        error: "Cloudflare AI binding is not configured."
      }, 500);
    }

    try {
      const body = await request.json();

      // 1. GENERAL CHAT
      if (url.pathname === "/api/chat") {
        const message = body.message;

        if (typeof message !== "string" || !message.trim()) {
          return respond({ error: "Please enter a message." }, 400);
        }

        if (message.length > 50000) {
          return respond({ error: "Message is too long." }, 413);
        }

        const result = await env.AI.run(CHAT_MODEL, {
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: message.trim() }
          ],
          chat_template_kwargs: {
            enable_thinking: false
          }
        });

        const answer =
          result?.choices?.[0]?.message?.content ||
          result?.response ||
          result?.text;

        if (!answer) {
          return respond({ error: "Empty AI response." }, 502);
        }

        return respond({
          response: answer,
          assistant: "DRIPSCALLION AI"
        });
      }

      // 2. IMAGE GENERATION
      if (url.pathname === "/api/image") {
        const prompt = body.prompt;

        if (typeof prompt !== "string" || !prompt.trim()) {
          return respond({ error: "Describe the image you want." }, 400);
        }

        if (prompt.length > 2000) {
          return respond({ error: "Prompt is too long." }, 413);
        }

        const result = await env.AI.run(IMAGE_MODEL, {
          prompt: prompt.trim(),
          steps: 4
        });

        if (!result?.image) {
          return respond({
            error: "Image generation returned no image."
          }, 502);
        }

        return respond({
          image: `data:image/jpeg;base64,${result.image}`,
          assistant: "DRIPSCALLION AI"
        });
      }

      // 3. IMAGE UNDERSTANDING AND VIDEO FRAME ANALYSIS
      if (url.pathname === "/api/vision") {
        const prompt =
          typeof body.prompt === "string" && body.prompt.trim()
            ? body.prompt.trim()
            : "Describe what you can see.";

        const images = Array.isArray(body.images)
          ? body.images
          : body.image
            ? [body.image]
            : [];

        if (!images.length) {
          return respond({ error: "Please attach an image." }, 400);
        }

        if (images.length > 5) {
          return respond({
            error: "Send no more than five images at a time."
          }, 400);
        }

        const content = [
          { type: "text", text: prompt }
        ];

        for (const image of images) {
          if (
            typeof image !== "string" ||
            !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image)
          ) {
            return respond({
              error: "Use JPEG, PNG or WebP images."
            }, 400);
          }

          if (image.length > 7 * 1024 * 1024) {
            return respond({
              error: "An image is too large."
            }, 413);
          }

          content.push({
            type: "image_url",
            image_url: { url: image }
          });
        }

        const result = await env.AI.run(CHAT_MODEL, {
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content }
          ],
          chat_template_kwargs: {
            enable_thinking: false
          }
        });

        const answer =
          result?.choices?.[0]?.message?.content ||
          result?.response ||
          result?.text;

        if (!answer) {
          return respond({
            error: "Image analysis returned no answer."
          }, 502);
        }

        return respond({
          response: answer,
          assistant: "DRIPSCALLION AI"
        });
      }

      // 4. SPEECH TO TEXT
      if (url.pathname === "/api/transcribe") {
        const audio = body.audio;

        if (typeof audio !== "string" || !audio.trim()) {
          return respond({ error: "Please provide audio." }, 400);
        }

        if (audio.length > 10 * 1024 * 1024) {
          return respond({ error: "Audio file is too large." }, 413);
        }

        const result = await env.AI.run(SPEECH_MODEL, {
          audio,
          task: "transcribe"
        });

        if (!result?.text) {
          return respond({
            error: "Could not transcribe the audio."
          }, 502);
        }

        return respond({
          text: result.text,
          assistant: "DRIPSCALLION AI"
        });
      }

      // 5. TEXT TO SPEECH
      if (url.pathname === "/api/speak") {
        const text = body.text;

        if (typeof text !== "string" || !text.trim()) {
          return respond({ error: "Please provide text." }, 400);
        }

        if (text.length > 3000) {
          return respond({ error: "Text is too long." }, 413);
        }

        const audio = await env.AI.run(VOICE_MODEL, {
          text: text.trim(),
          encoding: "mp3",
          container: "none",
          speaker: "luna"
        });

        return new Response(audio, {
          headers: {
            ...cors,
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store"
          }
        });
      }

      // 6. VIDEO GENERATION
      if (url.pathname === "/api/video/generate") {
        return respond({
          available: false,
          error: "A video generation provider must be connected before this feature can work."
        }, 501);
      }

      // 7. IMAGE EDITING
      if (url.pathname === "/api/image/edit") {
        return respond({
          available: false,
          error: "An image editing model has not been connected yet."
        }, 501);
      }

      return respond({ error: "Route not found." }, 404);

    } catch (error) {
      console.error("DRIPSCALLION AI:", error);

      return respond({
        error: error?.message || "AI service error. Please try again."
      }, 500);
    }
  }
};
