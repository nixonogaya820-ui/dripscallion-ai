
const CHAT_MODEL = "@cf/google/gemma-4-26b-a4b-it";
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const IMAGE_EDIT_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
const SPEECH_MODEL = "@cf/openai/whisper-large-v3-turbo";
const VOICE_MODEL = "@cf/deepgram/aura-2-en";

const SYSTEM_PROMPT = `
You are DRIPSCALLION AI, an intelligent, friendly and natural AI assistant.

Your founder is Job Muuo, known as Drips, from Machakos, Kenya.
Your tagline is "FROM MACHAKOS TO THE WORLD."
The founder created the DRIPSCALLION AI platform, not the underlying third-party AI models.

LANGUAGE:
- Detect the main language of the latest user message.
- Reply in that language only.
- Use English for English, Kiswahili for Kiswahili and natural Kenyan Sheng for Sheng.
- Do not randomly mix languages.
- Switch when the user switches languages or requests translation.

PERSONALITY:
- Be intelligent, friendly, natural and respectful.
- Keep ordinary answers concise.
- Avoid unnecessary long descriptions.
- Understand short instructions using conversation context.
- Ask questions only when essential.
- Never invent facts or claim an action succeeded when it did not.

CODING:
- Put source code inside properly labelled code blocks.
- Provide copy-ready code.
- Provide complete replacement files when requested.
- Explain errors clearly.

EDUCATION:
- Support all subjects from primary school to secondary school, college, university and professional learning.
- Explain concepts clearly.
- Generate notes, revision questions, quizzes and practice answers.
- Never misrepresent practice material as official examinations.

CREATIVITY:
- Support image prompts, image understanding and image editing.
- Follow the user's visual instructions carefully.
- When editing a supplied photo, try to preserve the original subject, face, skin tone, hairstyle, body proportions, pose and composition unless the user asks for a change.
- Do not promise perfect identity preservation.
- Never claim an image was created or edited unless the image service succeeds.

Always be accurate and honest about limitations.
`;

const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_PROMPT_LENGTH = 16000;

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

function getText(result) {
  const content =
    result?.choices?.[0]?.message?.content ??
    result?.response ??
    result?.text ??
    "";

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map(part =>
        typeof part === "string" ? part : part?.text || ""
      )
      .join("\n")
      .trim();
  }

  return "";
}

async function readRequestBody(request) {
  const contentLength = Number(
    request.headers.get("Content-Length") || 0
  );

  if (contentLength > MAX_REQUEST_BYTES) {
    throw new Error("REQUEST_TOO_LARGE");
  }

  const raw = await request.text();

  if (
    new TextEncoder().encode(raw).byteLength >
    MAX_REQUEST_BYTES
  ) {
    throw new Error("REQUEST_TOO_LARGE");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function decodeDataUrl(dataUrl, maxBytes = MAX_IMAGE_BYTES) {
  if (typeof dataUrl !== "string") {
    throw new Error("File data is missing.");
  }

  const match = dataUrl.match(
    /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/i
  );

  if (!match) {
    throw new Error("Invalid Base64 file format.");
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, "");

  if (base64.length > Math.ceil(maxBytes * 4 / 3) + 8) {
    throw new Error("File is too large.");
  }

  let binary;

  try {
    binary = atob(base64);
  } catch {
    throw new Error("Invalid Base64 data.");
  }

  if (binary.length > maxBytes) {
    throw new Error("File is too large.");
  }

  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return { mimeType, base64, bytes };
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, i + chunkSize)
    );
  }

  return btoa(binary);
}

function fileExtension(name) {
  const value = String(name || "").toLowerCase();
  const index = value.lastIndexOf(".");

  return index >= 0 ? value.slice(index) : "";
}

function imageToDataUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("The image model returned no image.");
  }

  if (value.startsWith("data:image/")) {
    return value;
  }

  return `data:image/jpeg;base64,${value}`;
}

function isValidImageData(value) {
  if (
    typeof value !== "string" ||
    !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value)
  ) {
    return false;
  }

  try {
    decodeDataUrl(value);
    return true;
  } catch {
    return false;
  }
}

function getAllowedDocumentExtensions() {
  return [
    ".pdf",
    ".docx",
    ".xlsx",
    ".xls",
    ".xlsm",
    ".xlsb",
    ".et",
    ".odt",
    ".ods",
    ".csv",
    ".html",
    ".htm",
    ".xml",
    ".numbers"
  ];
}

function decodeText(bytes) {
  return new TextDecoder("utf-8", {
    fatal: false
  }).decode(bytes).trim();
}

function normalizeImageMimeType(mimeType) {
  const value = String(mimeType || "").toLowerCase();

  if (value === "image/jpg") {
    return "image/jpeg";
  }

  return value;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const requestOrigin = request.headers.get("Origin");

    // This API is intended to be called from the DRIPSCALLION AI website.
    const originIsAllowed =
      !requestOrigin || requestOrigin === url.origin;

    const cors = {
      "Access-Control-Allow-Origin":
        originIsAllowed
          ? (requestOrigin || url.origin)
          : "null",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: cors
      });
    }

    if (!originIsAllowed) {
      return jsonResponse({
        error: "Cross-origin requests are not allowed."
      }, 403, cors);
    }

    // HEALTH CHECK
    if (
      url.pathname === "/api/health" &&
      request.method === "GET"
    ) {
      return jsonResponse({
        online: true,
        assistant: "DRIPSCALLION AI",
        features: {
          chat: true,
          imageGeneration: true,
          imageUnderstanding: true,
          documentReading: true,
          studyContentGeneration: true,
          imageEditing: true,
          imageEditingModel: IMAGE_EDIT_MODEL,
          paidImageEditing: false,
          speechToText: true,
          textToSpeech: true,
          videoGeneration: false,
          webSearch: false
        }
      }, 200, cors);
    }

    if (url.pathname === "/" && request.method === "GET") {
      return new Response("DRIPSCALLION AI is online!", {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }

    if (!url.pathname.startsWith("/api/")) {
      return jsonResponse({
        error: "Route not found."
      }, 404, cors);
    }

    if (request.method !== "POST") {
      return jsonResponse({
        error: "Method not allowed."
      }, 405, cors);
    }

    if (!env.AI || typeof env.AI.run !== "function") {
      return jsonResponse({
        error: "Cloudflare AI binding is not configured."
      }, 500, cors);
    }

    let body;

    try {
      body = await readRequestBody(request);
    } catch (error) {
      if (error.message === "REQUEST_TOO_LARGE") {
        return jsonResponse({
          error: "Request is too large. Use a smaller file."
        }, 413, cors);
      }

      return jsonResponse({
        error: "Invalid JSON request."
      }, 400, cors);
    }

    try {

      // 1. GENERAL AI CHAT
      if (url.pathname === "/api/chat") {
        let messages = [];

        if (Array.isArray(body.messages)) {
          if (
            body.messages.length < 1 ||
            body.messages.length > 40
          ) {
            return jsonResponse({
              error: "Send between 1 and 40 messages."
            }, 400, cors);
          }

          for (const item of body.messages) {
            if (
              !item ||
              !["user", "assistant"].includes(item.role) ||
              typeof item.content !== "string" ||
              !item.content.trim() ||
              item.content.length > MAX_PROMPT_LENGTH
            ) {
              return jsonResponse({
                error: "Invalid or oversized conversation message."
              }, 400, cors);
            }

            messages.push({
              role: item.role,
              content: item.content.trim()
            });
          }
        } else {
          if (
            typeof body.message !== "string" ||
            !body.message.trim()
          ) {
            return jsonResponse({
              error: "Please enter a message."
            }, 400, cors);
          }

          if (body.message.length > 50000) {
            return jsonResponse({
              error: "Message is too long."
            }, 413, cors);
          }

          messages = [{
            role: "user",
            content: body.message.trim()
          }];
        }

        const result = await env.AI.run(CHAT_MODEL, {
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT
            },
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
        const prompt =
          typeof body.prompt === "string"
            ? body.prompt.trim()
            : "";

        if (!prompt) {
          return jsonResponse({
            error: "Describe the image you want to create."
          }, 400, cors);
        }

        if (prompt.length > 2048) {
          return jsonResponse({
            error: "Image description is too long."
          }, 413, cors);
        }

        const steps = Number.isInteger(body.steps)
          ? Math.min(8, Math.max(1, body.steps))
          : 8;

        const result = await env.AI.run(IMAGE_MODEL, {
          prompt,
          steps
        });

        if (!result?.image) {
          return jsonResponse({
            error: "Image generation returned no image."
          }, 502, cors);
        }

        const image = imageToDataUrl(result.image);

        return jsonResponse({
          image,
          dataURI: image,
          assistant: "DRIPSCALLION AI"
        }, 200, cors);
      }

      // 3. IMAGE EDITING - FLUX.2 KLEIN 4B
      if (url.pathname === "/api/image/edit") {
        const prompt =
          typeof body.prompt === "string"
            ? body.prompt.trim()
            : "";

        const inputImage =
          body.image ||
          body.inputImage ||
          body.fileData;

        if (!prompt) {
          return jsonResponse({
            error: "Describe the image changes you want."
          }, 400, cors);
        }

        if (prompt.length > 2000) {
          return jsonResponse({
            error: "Editing instructions are too long."
          }, 413, cors);
        }

        if (!isValidImageData(inputImage)) {
          return jsonResponse({
            error: "Attach a JPEG, PNG or WebP image."
          }, 400, cors);
        }

        const decoded = decodeDataUrl(
          inputImage,
          MAX_IMAGE_BYTES
        );

        const mimeType = normalizeImageMimeType(
          decoded.mimeType
        );

        if (
          !["image/jpeg", "image/png", "image/webp"].includes(mimeType)
        ) {
          return jsonResponse({
            error: "Use a JPEG, PNG or WebP image."
          }, 415, cors);
        }

        // FLUX.2 Klein 4B requires multipart form data.
        // Reference images must be smaller than 512 x 512 pixels.
        // The frontend image-resizing step will be added next.
        const form = new FormData();

        form.append("prompt", prompt);

        form.append(
          "input_image_0",
          new Blob([decoded.bytes], {
            type: mimeType
          }),
          "reference-image"
        );

        form.append("width", "1024");
        form.append("height", "1024");

        const formResponse = new Response(form);

        const result = await env.AI.run(
          IMAGE_EDIT_MODEL,
          {
            multipart: {
              body: formResponse.body,
              contentType: formResponse.headers.get("content-type")
            }
          }
        );

        if (!result?.image) {
          return jsonResponse({
            error: "The image editor returned no image."
          }, 502, cors);
        }

        const image = imageToDataUrl(result.image);

        return jsonResponse({
          image,
          dataURI: image,
          assistant: "DRIPSCALLION AI",
          model: IMAGE_EDIT_MODEL
        }, 200, cors);
      }

      // 4. IMAGE UNDERSTANDING
      if (url.pathname === "/api/vision") {
        const prompt =
          typeof body.prompt === "string" && body.prompt.trim()
            ? body.prompt.trim()
            : "Describe this image and explain its important details.";

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

        const content = [{
          type: "text",
          text: prompt
        }];

        for (const image of images) {
          if (!isValidImageData(image)) {
            return jsonResponse({
              error: "Use JPEG, PNG or WebP images, up to 5 MB each."
            }, 400, cors);
          }

          content.push({
            type: "image_url",
            image_url: {
              url: image
            }
          });
        }

        const result = await env.AI.run(CHAT_MODEL, {
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT
            },
            {
              role: "user",
              content
            }
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

      // 5. DOCUMENT READING
      if (url.pathname === "/api/document") {
        const name = String(
          body.name || body.filename || "document.pdf"
        ).slice(0, 150);

        const fileData =
          body.fileData ||
          body.file ||
          body.data;

        const extension = fileExtension(name);

        const decoded = decodeDataUrl(
          fileData,
          MAX_DOCUMENT_BYTES
        );

        const bytes = decoded.bytes;

        // Read plain text directly.
        if ([".txt", ".md"].includes(extension)) {
          const text = decodeText(bytes);

          if (!text) {
            return jsonResponse({
              error: "This text document is empty."
            }, 422, cors);
          }

          return jsonResponse({
            name,
            text: text.slice(0, 100000),
            format: extension.slice(1),
            assistant: "DRIPSCALLION AI"
          }, 200, cors);
        }

        if (!getAllowedDocumentExtensions().includes(extension)) {
          return jsonResponse({
            error: "Unsupported document type. Use PDF, DOCX, XLSX, XLS, CSV, ODT, ODS, HTML, XML, TXT or MD."
          }, 415, cors);
        }

        if (typeof env.AI.toMarkdown !== "function") {
          return jsonResponse({
            error: "Cloudflare document conversion is unavailable on this AI binding."
          }, 501, cors);
        }

        const blob = new Blob([bytes], {
          type: decoded.mimeType
        });

        const conversion = await env.AI.toMarkdown({
          name,
          blob
        });

        const converted = Array.isArray(conversion)
          ? conversion[0]
          : conversion;

        if (
          !converted ||
          converted.format === "error" ||
          converted.error
        ) {
          return jsonResponse({
            error: converted?.error || "Could not read this document."
          }, 422, cors);
        }

        const documentText = String(
          converted.data || ""
        ).trim();

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

      // 6. EDUCATIONAL PDF CONTENT
      if (url.pathname === "/api/pdf/content") {
        const prompt =
          typeof body.prompt === "string"
            ? body.prompt.trim()
            : "";

        if (!prompt) {
          return jsonResponse({
            error: "Describe the study material you want to create."
          }, 400, cors);
        }

        if (prompt.length > 8000) {
          return jsonResponse({
            error: "The study-material request is too long."
          }, 413, cors);
        }

        const pdfSystemPrompt = `
You are DRIPSCALLION AI's educational document creator.

Support all subjects and learning levels:
primary, secondary, college, university and professional learning.

Create accurate, clearly structured study materials.

Use:
- A clear document title.
- Logical headings and subheadings.
- Simple explanations appropriate to the requested level.
- Examples where helpful.
- Revision questions when requested.
- MCQs and short-answer questions when requested.
- Essay questions when requested.
- Clearly separated answer keys when requested.

Never claim generated practice material is an official examination.
Never invent official marking schemes.
Avoid unnecessary introductions and filler.
Use the same language as the user.
Return clean Markdown suitable for PDF formatting.
`;

        const result = await env.AI.run(CHAT_MODEL, {
          messages: [
            {
              role: "system",
              content: pdfSystemPrompt
            },
            {
              role: "user",
              content: prompt
            }
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
          title: "DRIPSCALLION AI Study Material",
          content,
          markdown: content,
          format: "markdown",
          assistant: "DRIPSCALLION AI"
        }, 200, cors);
      }

      // 7. SPEECH-TO-TEXT
      if (url.pathname === "/api/transcribe") {
        const audio = body.audio;

        if (typeof audio !== "string" || !audio.trim()) {
          return jsonResponse({
            error: "Please provide audio data."
          }, 400, cors);
        }

        if (audio.length > 10 * 1024 * 1024) {
          return jsonResponse({
            error: "Audio file is too large."
          }, 413, cors);
        }

        const result = await env.AI.run(SPEECH_MODEL, {
          audio,
          task: body.task === "translate"
            ? "translate"
            : "transcribe"
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

      // 8. TEXT-TO-SPEECH
      if (url.pathname === "/api/speak") {
        const text =
          typeof body.text === "string"
            ? body.text.trim()
            : "";

        if (!text) {
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
          text,
          encoding: "mp3",
          container: "none",
          speaker: "luna"
        });

        if (!audio) {
          return jsonResponse({
            error: "Text-to-speech returned no audio."
          }, 502, cors);
        }

        return new Response(audio, {
          status: 200,
          headers: {
            ...cors,
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store"
          }
        });
      }

      // VIDEO GENERATION IS INTENTIONALLY NOT INCLUDED.
      // WEB SEARCH WILL BE ADDED AFTER A SAFE FREE PROVIDER IS VERIFIED.
      return jsonResponse({
        error: "Route not found."
      }, 404, cors);

    } catch (error) {
      console.error("DRIPSCALLION AI API error:", error);

      return jsonResponse({
        error: error?.message || "AI service error. Please try again."
      }, 502, cors);
    }
  }
};
