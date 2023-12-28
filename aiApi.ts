import * as replitai from '@replit/ai-modelfarm'

interface ChatResponse {
    value: {
        message: {
            content: string;
        };
    };
}

interface PerplexityResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

export async function modelfarmChatComplete(messageContent: string): Promise<string | null> {
    try {
        const result = await replitai.chat({
            model: "chat-bison",
            temperature: 0.5,
            messages: [{ author: "user", content: messageContent }],
        }) as ChatResponse;

        const content = result.value.message.content;
        return content;
    } catch (error) {
        console.error("Error sending message to Model Farm:", error);
        return null;
    }
}

export async function pplxChatComplete(messageContent: string, model: string): Promise<string | null> {
    try {
        const response = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.PPLX_API_KEY}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: "system", content: "Be precise and concise." },
                    { role: "user", content: messageContent },
                ],
                stream: false,
            }),
        });

        const data = await response.json() as PerplexityResponse;
        // console.log("Response from Perplexity AI:", data);

        const content = data.choices[0].message.content;
        return content;
    } catch (error) {
        console.error("Error sending message to Perplexity AI:", error);
        return null;
    }
}
