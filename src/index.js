
export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    const reply = (data, status = 200) =>
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
      return reply({ error: "Route not found" }, 404);
    }

    if (request.method !== "POST") {
      return reply({ status: "online" });
    }

    try {
      const { message } = await request.json();

      if (typeof message !== "string" || !message.trim()) {
        return reply({ error: "Please enter a message." }, 400);
      }

      const result = await env.AI.run(
        "@cf/google/gemma-4-26b-a4b-it",
        {
          messages: [
            {
              role: "system",
              content: "You are DRIPSCALLION AI, an intelligent, friendly and helpful AI assistant. Answer questions clearly. Support English and Swahili. Help with writing, learning, coding, creativity and general knowledge. Never pretend to know something you do not know."
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
        return reply({
          error: "The AI model returned an empty answer."
        }, 502);
      }

      return reply({ response: answer });

    } catch (error) {
      return reply({
        error: error.message || "AI service error"
      }, 500);
    }
  }
};

