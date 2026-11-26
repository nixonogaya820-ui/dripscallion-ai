
const CHAT_MODEL = "@cf/google/gemma-4-26b-a4b-it";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const IMAGE_EDIT_MODEL = "black-forest-labs/flux-1-kontext-pro";
const SPEECH_MODEL = "@cf/openai/whisper-large-v3-turbo";
const VOICE_MODEL = "@cf/deepgram/aura-2-en";

const SYSTEM_PROMPT = `
You are DRIPSCALLION AI, an intelligent, friendly and natural AI assistant.

Your founder is Job Muuo, known as Drips, from Machakos, Kenya.
Your tagline is "FROM MACHAKOS TO THE WORLD."
The founder created the DRIPSCALLION AI platform, not the third-party AI models.

LANGUAGE:
- Detect the main language of the latest user message.
- Reply in that language only.
- English means English only.
- Kiswahili means Kiswahili only.
- Kenyan Sheng means natural Kenyan Sheng.
- Do not randomly mix languages.
- Use another language only when the user requests translation or bilingual output.

PERSONALITY:
- Be intelligent, natural, friendly, respectful and accurate.
- Keep ordinary answers concise.
- Do not give long descriptions unless requested.
- Understand short instructions using the conversation context.
- Ask a question only when essential information is missing.
- Never invent facts or claim an action succeeded if it did not.

CODING:
- Put code inside properly labelled code blocks.
- Keep code separate from explanations.
- Use complete working code when the user requests a full replacement.
- Do not replace functioning systems unnecessarily.

EDUCATION:
- Support all subjects and learning levels, from primary school to college, university and professional learning.
- Explain concepts clearly.
- Generate practice questions, quizzes, revision materials and answer keys when requested.
- Do not claim generated work is an official examination or marking scheme.

CREATIVITY:
- Help with image prompts, writing, design and image understanding.
- Follow the user's instructions carefully.
- Do not claim an image has been edited or generated unless the image tool returns a successful result.

Always be honest about limitations.
`;

const MAX_PROMPT = 12000;
const MAX_IMAGE_DATA = 7 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

function getText(result) {
  const content =
    result?.choices?.[0]?.message?.content ??
    result?.response ??
    result?.text ??
    "";

  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map(part => typeof part === "string" ? part : part?.text || "")
      .join("\n")
      .trim();
  }

  return "";
}

function jsonResponse(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") {
    throw new Error("File data is missing.");
  }

  const match = dataUrl.match(
    /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/
  );

  if (!match) {
    throw new Error("Invalid file format.");
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, "");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return { mimeType, bytes };
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function imageValueToDataUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("The image service returned no image.");
  }

  if (value.startsWith("data:image/")) {
    return value;
  }

  if (/^https:\/\/|^http:\/\//i.test(value)) {
    const response = await fetch(value);

    if (!response.ok) {
      throw new Error("Could not retrieve the edited image.");
    }

    const mimeType =
      response.headers.get("content-type")?.split(";")[0] ||
      "image/jpeg";

    if (!mimeType.startsWith("image/")) {
      throw new Error("The image service returned an invalid file.");
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
  }

  return `data:image/jpeg;base64,${value}`;
}

function isAllowedImageData(value) {
  return (
    typeof value === "string" &&
    /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value) &&
    value.length <= MAX_IMAGE_DATA
  );
}

function getFileExtension(name) {
  const cleanName = String(name || "").toLowerCase();
  const index = cleanName.lastIndexOf(".");
  return index >= 0 ? cleanName.slice(index) : "";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    let allowedOrigin = url.origin;

    try {
      if (origin && new URL(origin).origin === url.origin) {
        allowedOrigin = origin;
      }
    } catch {
      allowedOrigin = url.origin;
    }

    const cors = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (url.pathname === "/") {
      return new Response("DRIPSCALLION AI is online!", {
        headers: {
          ...cors,
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return jsonResponse({
        online: true,
        assistant: "DRIPSCALLION AI",
        available: [
          "chat",
          "image-generation",
          "image-editing",
          "image-understanding",
          "document-reading",
          "pdf-content-generation",
          "speech-to-text",
          "text-to-speech"
        ],
        videoGeneration: false
      }, 200, cors);
    }

    if (!url.pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Route not found." }, 404, cors);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, cors);
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);

    if (contentLength > 12 * 1024 * 1024) {
      return jsonResponse({
        error: "The request is too large. Please use a smaller file."
      }, 413, cors);
    }

    if (!env.AI) {
      return jsonResponse({
        error: "Cloudflare AI binding is not configured."
      }, 500, cors);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid request data." }, 400, cors);
    }

    try {
      // 1. GENERAL CHAT
      if (url.pathname === "/api/chat") {
        let messages = [];

        if (Array.isArray(body.messages)) {
          if (body.messages.length > 40) {
            return jsonResponse({
              error: "Please send a shorter conversation."
            }, 413, cors);
          }

          messages = body.messages.map(item => {
            const role = item?.role;

            if (role !== "user" && role !== "assistant") {
              throw new Error("Invalid conversation role.");
            }

            if (
              typeof item?.content !== "string" ||
              item.content.length > MAX_PROMPT
            ) {
              throw new Error("A conversation message is invalid or too long.");
            }

            return {
              role,
              content: item.content
            };
          });
        } else {
          const message = body.message;

          if (
            typeof message !== "string" ||
            !message.trim()
          ) {
            return jsonResponse({
              error: "Please enter a message."
            }, 400, cors);
          }

          if (message.length > 50000) {
            return jsonResponse({
              error: "Message is too long."
            }, 413, cors);
          }

          messages = [{ role: "user", content: message.trim() }];
        }

        if (!messages.length) {
          return jsonResponse({
            error: "No messages were provided."
          }, 400, cors);
        }

        const result = await env.AI.run(CHAT_MODEL, {
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages
          ],
          max_tokens: 4096,
          chat_template_kwargs: {
            enable_thinking: false
          }
        });

        const answer = getText(result);

        if (!answer) {
          return jsonResponse({
            error: "The AI returned an empty response."
          }, 502, cors);
        }

        return jsonResponse({
          response: answer,
          assistant: "DRIPSCALLION AI"
        }, 200, cors);
      }

      // 2. TEXT-TO-IMAGE GENERATION
      if (url.pathname === "/api/image") {
        const prompt = body.prompt;

        if (typeof prompt !== "string" || !prompt.trim()) {
          return jsonResponse({
            error: "Describe the image you want to create."
          }, 400, cors);
        }

        if (prompt.length > 2048) {
          return jsonResponse({
            error: "Image description is too long."
          }, 413, cors);
        }

        const result = await env.AI.run(IMAGE_MODEL, {
          prompt: prompt.trim(),
          steps: 8
        });

        if (!result?.image) {
          return jsonResponse({
            error: "Image generation returned no image."
          }, 502, cors);
        }

        return jsonResponse({
          image: `data:image/jpeg;base64,${result.image}`,
          assistant: "DRIPSCALLION AI"
        }, 200, cors);
      }

      // 3. IMAGE EDITING
      if (url.pathname === "/api/image/edit") {
        const prompt = body.prompt;
        const inputImage = body.image || body.inputImage;

        if (typeof prompt !== "string" || !prompt.trim()) {
          return jsonResponse({
            error: "Describe the changes you want to make."
          }, 400, cors);
        }

        if (prompt.length > 2000) {
          return jsonResponse({
            error: "Editing instructions are too long."
          }, 413, cors);
        }

        if (!isAllowedImageData(inputImage)) {
          return jsonResponse({
            error: "Please upload a JPEG, PNG or WebP image under the size limit."
          }, 400, cors);
        }

        const result = await env.AI.run(IMAGE_EDIT_MODEL, {
          prompt: prompt.trim(),
          input_image: inputImage,
          output_format: "jpeg"
        });

        const imageValue =
          result?.image ||
          result?.result?.image ||
          result?.output?.image;

        const image = await imageValueToDataUrl(imageValue);

        return jsonResponse({
          image,
          assistant: "DRIPSCALLION AI"
        }, 200, cors);
      }

      // 4. IMAGE UNDERSTANDING
      if (url.pathname === "/api/vision") {
        const prompt =
          typeof body.prompt === "string" && body.prompt.trim()
            ? body.prompt.trim()
            : "Describe this image and explain the important details.";

        const images = Array.isArray(body.images)
          ? body.images
          : body.image
            ? [body.image]
            : [];

        if (!images.length) {
          return jsonResponse({
            error: "Please attach an image."
          }, 400, cors);
        }

        if (images.length > 5) {
          return jsonResponse({
            error: "Send no more than five images at a time."
          }, 400, cors);
        }

        const content = [{ type: "text", text: prompt }];

        for (const image of images) {
          if (!isAllowedImageData(image)) {
            return jsonResponse({
              error: "Use JPEG, PNG or WebP images under the size limit."
            }, 400, cors);
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
          max_tokens: 3000,
          chat_template_kwargs: {
            enable_thinking: false
          }
        });

        const answer = getText(result);

        if (!answer) {
          return jsonResponse({
            error: "Image understanding returned no answer."
          }, 502, cors);
        }

        return jsonResponse({
          response: answer,
          assistant: "DRIPSCALLION AI"
        }, 200, cors);
      }

      // 5. DOCUMENT READING: PDF, DOCX, TXT AND OTHER SUPPORTED FORMATS
      if (url.pathname === "/api/document") {
        if (typeof env.AI.toMarkdown !== "function") {
          return jsonResponse({
            error: "Document conversion is not available on this AI binding."
          }, 501, cors);
        }

        const name = String(body.name || "document.pdf").slice(0, 120);
        const fileData = body.fileData || body.file;

        let decoded;

        try {
          decoded = decodeDataUrl(fileData);
        } catch (error) {
          return jsonResponse({ error: error.message }, 400, cors);
        }

        if (decoded.bytes.byteLength > MAX_DOCUMENT_BYTES) {
          return jsonResponse({
            error: "Document is too large. Maximum size is 8 MB."
          }, 413, cors);
        }

        const allowedExtensions = [
          ".pdf", ".docx", ".doc",
          ".txt", ".md", ".csv",
          ".pptx", ".xlsx"
        ];

        const extension = getFileExtension(name);

        if (!allowedExtensions.includes(extension)) {
          return jsonResponse({
            error: "Supported files: PDF, DOCX, DOC, TXT, MD, CSV, PPTX and XLSX."
          }, 415, cors);
        }

        const blob = new Blob([decoded.bytes], {
          type: decoded.mimeType
        });

        const conversion = await env.AI.toMarkdown({
          name,
          blob
        });

        const converted = Array.isArray(conversion)
          ? conversion[0]
          : conversion;

        if (!converted || converted.error || converted.format === "error") {
          return jsonResponse({
            error: converted?.error || "Could not read this document."
          }, 422, cors);
        }

        const documentText = String(converted.data || "").trim();

        if (!documentText) {
          return jsonResponse({
            error: "No readable text was found in this document."
          }, 422, cors);
        }

        return jsonResponse({
          name,
          text: documentText.slice(0, 100000),
          format: converted.format || "markdown",
          assistant: "DRIPSCALLION AI"
        }, 200, cors);
      }

      // 6. EDUCATIONAL PDF CONTENT GENERATION
      if (url.pathname === "/api/pdf/content") {
        const prompt = body.prompt;

        if (typeof prompt !== "string" || !prompt.trim()) {
          return jsonResponse({
            error: "Describe the study material you want to create."
          }, 400, cors);
        }

        if (prompt.length > 8000) {
          return jsonResponse({
            error: "The PDF request is too long."
          }, 413, cors);
        }

        const pdfSystemPrompt = `
You are the DRIPSCALLION AI educational document creator.

Create accurate, well-organized educational material for the subject,
level and topic requested by the user.

Support primary school, secondary school, college, university
and professional learning across all subjects.

Use clear headings and subheadings.
Explain concepts in a learner-friendly way.
Include examples when useful.
When requested, create revision questions, MCQs, short-answer
questions, essay questions and a separate answer key.
Do not invent official examination papers or claim a marking scheme
is official.
Do not add filler or long introductions.
Use the same language as the user's request.
Return clean Markdown with a clear document title.
`;

        const result = await env.AI.run(CHAT_MODEL, {
          messages: [
            { role: "system", content: pdfSystemPrompt },
            { role: "user", content: prompt.trim() }
          ],
          max_tokens: 6000,
          chat_template_kwargs: {
            enable_thinking: false
          }
        });

        const content = getText(result);

        if (!content) {
          return jsonResponse({
            error: "Could not create the study material."
          }, 502, cors);
        }

        return jsonResponse({
          content,
          assistant: "DRIPSCALLION AI"
        }, 200, cors);
      }

      // 7. SPEECH TO TEXT
      if (url.pathname === "/api/transcribe") {
        const audio = body.audio;

        if (typeof audio !== "string" || !audio.trim()) {
          return jsonResponse({
            error: "Please provide an audio recording."
          }, 400, cors);
        }

        if (audio.length > 10 * 1024 * 1024) {
          return jsonResponse({
            error: "Audio file is too large."
          }, 413, cors);
        }

        const result = await env.AI.run(SPEECH_MODEL, {
          audio,
          task: "transcribe"
        });

        if (!result?.text) {
          return jsonResponse({
            error: "Could not transcribe the audio."
          }, 502, cors);
        }

        return jsonResponse({
          text: result.text,
          assistant: "DRIPSCALLION AI"
        }, 200, cors);
      }

      // 8. TEXT TO SPEECH
      if (url.pathname === "/api/speak") {
        const text = body.text;

        if (typeof text !== "string" || !text.trim()) {
          return jsonResponse({
            error: "Please provide text."
          }, 400, cors);
        }

        if (text.length > 3000) {
          return jsonResponse({
            error: "Text is too long."
          }, 413, cors);
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

      // VIDEO GENERATION IS NOT PART OF THIS VERSION.
      return jsonResponse({
        error: "Route not found."
      }, 404, cors);

    } catch (error) {
      console.error("DRIPSCALLION AI API error:", error);

      return jsonResponse({
        error: error?.message || "AI service error. Please try again."
      }, 500, cors);
    }
  }
};
