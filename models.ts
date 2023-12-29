import XmppChatBot from "./NewXmppChatBot";
import { pplxChatComplete, modelfarmChatComplete } from "./aiApi";

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
}

export default function initializeClients(): void {
    Object.entries(models).forEach(([key, value]) => {
        const bot = new XmppChatBot(key, value)
        bot.start()
    })
};


// Idea for better chatbot:

// Should construct from a function that takes the message and returns the response, some meta, and some pricing meta where the ecash mechanism is handled by the bot