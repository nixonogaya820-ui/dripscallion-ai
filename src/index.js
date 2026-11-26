
export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("DRIPSCALLION AI is online!", {
        headers: corsHeaders
      });
    }

    try {
      const { message } = await request.json();

      const result = await env.AI.run(
        "@cf/meta/llama-3.1-8b-instruct",
        {
          messages: [
            {
              role: "system",
              content: "You are DRIPSCALLION AI, a helpful AI assistant."
            },
            {
              role: "user",
              content: message
            }
          ]
        }
      );

      return Response.json(result, { headers: corsHeaders });

    } catch (error) {
      return Response.json(
        { error: "AI request failed. Please try again." },
        { status: 500, headers: corsHeaders }
      );
    }
  }
};
