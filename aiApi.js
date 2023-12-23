const replitai = require("@replit/ai-modelfarm");

async function modelfarmChatComplete(messageContent) {
  try {
    const result = await replitai.chat({
      model: "chat-bison", // Model name passed as a parameter
      temperature: 0.5, // Adjust as needed
      messages: [{ author: "user", content: messageContent }],
    });
    const content = result.value.message.content;
    return content;
  } catch (error) {
    console.error("Error sending message to Model Farm:", error);
    return null; // Handle the error as appropriate
  }
}

async function pplxChatComplete(messageContent, model) {
  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PPLX_API_KEY}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: "Be precise and concise." },
          { role: "user", content: messageContent },
        ],
        stream: false,
      }),
    });
    const data = await response.json();
    console.log("Response from Perplexity AI:", data);
    const content = data.choices[0].message.content;
    console.log(content);
    return content;
  } catch (error) {
    console.error("Error sending message to Perplexity AI:", error);
  }
}

module.exports = {
  pplxChatComplete,
  modelfarmChatComplete,
};
