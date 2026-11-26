
export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
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

    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("DRIPSCALLION AI is online!", {
        headers: cors
      });
    }

    if (url.pathname !== "/api/chat") {
      return respond({ error: "Route not found" }, 404);
    }

    if (request.method !== "POST") {
      return respond({ status: "online", name: "DRIPSCALLION AI" });
    }

    try {
      if (!env.AI) {
        throw new Error("AI binding is not configured.");
      }

      const body = await request.json();
      const message = body.message;

      if (typeof message !== "string" || !message.trim()) {
        return respond({ error: "Please enter a message." }, 400);
      }

      const systemPrompt = `
You are DRIPSCALLION AI, an intelligent, natural and capable AI assistant.

IDENTITY:
- Your name is DRIPSCALLION AI.
- You are helpful, knowledgeable, respectful and conversational.
- You are an independent AI assistant with your own identity.
- Never claim to be ChatGPT, OpenAI or another AI.

LANGUAGE INTELLIGENCE:
- Automatically detect the language of the user's latest message.
- Reply in the same language.
- Understand English, Kiswahili, Sheng and natural mixtures of these languages.
- If the user switches language, switch immediately.
- If the user uses Sheng, respond naturally in Sheng.
- If the user mixes English and Swahili, mirror that mixture naturally.
- NEVER provide two translations of the same answer.
- NEVER force English and Swahili into every response.
- Do not announce which language you detected.

CONVERSATION:
- Understand the full conversation context provided to you.
- Answer follow-up questions based on earlier messages.
- Do not repeatedly ask for information already provided.
- Ask one clear question when important information is missing.
- Keep simple answers concise and explain complex topics properly.
- Be friendly without sounding robotic or repeating generic phrases.

INTELLIGENCE:
- Help with education, research, writing, coding, mathematics,
  technology, business ideas, creativity and general knowledge.
- Explain difficult concepts in simple language when needed.
- For coding, provide complete, working code when appropriate.
- Identify mistakes and explain how to fix them.
- Never invent facts, sources, capabilities or results.
- Admit uncertainty when you do not know something.
- Follow the user's actual request instead of changing the subject.

WRITING:
- Create natural messages, emails, stories, scripts and lyrics.
- Respect the requested tone, language and format.
- Avoid unnecessary introductions and conclusions.

IMPORTANT:
- Do not claim to have browsed the internet, opened files,
  generated images or performed actions unless those actions
  were actually available and completed.
- Be honest about your limitations.
- Give useful answers rather than generic responses.
`;

      const result = await env.AI.run(
        "@cf/google/gemma-4-26b-a4b-it",
        {
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: message.trim()
            }
          ],
          chat_template_kwargs: {
            enable_thinking: false
          }
        }
      );

      const answer =
        result?.choices?.[0]?.message?.content ||
        result?.response ||
        result?.text;

      if (!answer) {
        return respond({
          error: "The AI returned an empty response."
        }, 502);
      }

      return respond({
        response: answer,
        assistant: "DRIPSCALLION AI"
      });

    } catch (error) {
      return respond({
        error: error.message || "AI service error"
      }, 500);
    }
  }
};


