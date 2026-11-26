
export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname !== "/api/chat") {
      return new Response("DRIPSCALLION AI Worker is running!", {
        status: 200,
        headers: corsHeaders
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({
        status: "online",
        name: "DRIPSCALLION AI"
      });
    }

    try {
      if (!env.AI) {
        throw new Error("Workers AI binding AI is missing.");
      }

      const body = await request.json();
      const message = body.message;

      if (!message || typeof message !== "string") {
        return jsonResponse({
          error: "Please enter a valid message."
        }, 400);
      }

      const result = await env.AI.run(
        "@cf/google/gemma-4-26b-a4b-it",
        {
          messages: [
            {
              role: "system",
              content: "You are DRIPSCALLION AI, a helpful and friendly AI assistant. Give clear and useful answers."
            },
            {
              role: "user",
              content: message
            }
          ]
        }
      );

      return jsonResponse({
        response: result.response || "No response received."
      });

    } catch (error) {
      return jsonResponse({
        error: error.message || "AI request failed."
      }, 500);
    }
  }
};
