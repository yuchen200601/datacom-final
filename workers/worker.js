export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

    try {
      const json = await request.json();
      const userContractText = json.prompt || "";
      const GITHUB_TOKEN = env.GITHUB_TOKEN;

      // 1. 嚴格過濾無效輸入 (防幻覺)
      if (userContractText.length < 10) {
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "[]" }] } }] }), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

      const GITHUB_MODELS_URL = "https://models.inference.ai.azure.com/chat/completions";

      // 2. 透過 System Prompt 鎖定邏輯
      const response = await fetch(GITHUB_MODELS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GITHUB_TOKEN}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { 
              role: "system", 
              content: `你是一位台灣租賃法學專家。請針對使用者提供的「合約內容」進行審閱。
              1. 若合約內容空泛或無意義，請直接回傳 []。
              2. 只能分析「真實存在於輸入文字中」的條款，嚴禁憑空捏造。
              3. 必須回傳標準 JSON 陣列格式：[{"type": "顏色", "title": "...", "reason": "..."}]。
              4. 不要回傳任何 Markdown 標記，純文字 JSON 即可。` 
            },
            { role: "user", content: userContractText }
          ],
          temperature: 0
        })
      });

      const result = await response.json();
      if (result.error) throw new Error(result.error.message);

      let aiReplyText = result.choices[0].message.content.trim();
      
      // 移除可能存在的 Markdown 符號
      aiReplyText = aiReplyText.replace(/```json|```/g, "");

      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: aiReplyText }] } }],
        backup_active: false
      }), {
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: true, message: error.message }), { 
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      });
    }
  },
};