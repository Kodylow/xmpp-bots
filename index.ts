import XmppChatBot from "./XmppChatBot";
import { pplxChatComplete, modelfarmChatComplete, anyscaleChatComplete } from "./aiApi";

const models = {
    "pplx-7b-chat": pplxChatComplete,
    "pplx-70b-chat": pplxChatComplete,
    "pplx-7b-online": pplxChatComplete,
    "pplx-70b-online": pplxChatComplete,
    "llama-2-70b-chat": pplxChatComplete,
    "codellama-34b-instruct": pplxChatComplete,
    "mistral-7b-instruct": pplxChatComplete,
    "mixtral-8x7b-instruct": pplxChatComplete,
    "modelfarm": modelfarmChatComplete,
    "Llama-2-7b-chat-hf": anyscaleChatComplete,
    "Llama-2-13b-chat-hf": anyscaleChatComplete,
    "Llama-2-70b-chat-hf": anyscaleChatComplete,
    "Codellama-2-70b-chat-hf": anyscaleChatComplete,
    "Mistral-7B-Instruct-v0.1": anyscaleChatComplete,
    "Mixtral-8x7B-Instruct-v0.1": anyscaleChatComplete,
    "zephyr-7b-beta": anyscaleChatComplete,
    "Mistral-7B-OpenOrca": anyscaleChatComplete,
}

export default function initializeClients(): void {
    Object.entries(models).forEach(([name, chatFunction]) => {
        const bot = new XmppChatBot(name, chatFunction)
        bot.start()
    })
};

initializeClients();
