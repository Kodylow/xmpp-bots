import * as replitai from '@replit/ai-modelfarm'
import { OpenAI } from "openai";

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

export async function modelfarmChatComplete(messageContent: string, _model: string): Promise<string | null> {
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

const anyscaleMappings = {
    "Llama-2-7b-chat-hf": "meta-llama/Llama-2-7b-chat-hf",
    "Llama-2-13b-chat-hf": "meta-llama/Llama-2-13b-chat-hf",
    "Llama-2-70b-chat-hf": "meta-llama/Llama-2-70b-chat-hf",
    "CodeLlama-34b-Instruct-hf": "codellama/CodeLlama-34b-Instruct-hf",
    "Mistral-7B-Instruct-v0.1": "mistralai/Mistral-7B-Instruct-v0.1",
    "Mixtral-8x7B-Instruct-v0.1": "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "zephyr-7b-beta": "HuggingFaceH4/zephyr-7b-beta",
    "Mistral-7B-OpenOrca": "Open-Orca/Mistral-7B-OpenOrca",
}

export async function anyscaleChatComplete(messageContent: string, model: keyof typeof anyscaleMappings): Promise<string | null> {
    const mappedModel = anyscaleMappings[model];
    const anyscale = new OpenAI({
        baseURL: "https://api.endpoints.anyscale.com/v1",
        apiKey: process.env.ANYSCALE_API_KEY,
    });

    const completion = await anyscale.chat.completions.create({
        model: mappedModel,
        messages: [{ "role": "system", "content": "You are a helpful assistant." },
        { "role": "user", "content": messageContent }],
        temperature: 0.7
    });

    return completion.choices[0].message.content;
}