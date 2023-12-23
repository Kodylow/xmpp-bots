// Function to send a message to Perplexity AI
async function pplxChatComplete(messageContent) {
  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PPLX_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mistral-7b-instruct",
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

module.exports = pplxChatComplete;
