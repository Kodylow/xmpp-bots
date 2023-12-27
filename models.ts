import XmppChatBot from "./XmppChatBot";

const pplxModels = [
    "pplx-7b-chat",
    "pplx-70b-chat",
    "pplx-7b-online",
    "pplx-70b-online",
    "llama-2-70b-chat",
    "codellama-34b-instruct",
    "mistral-7b-instruct",
    "mixtral-8x7b-instruct",
];

const modelfarmModels = ["modelfarm"];

export default function initializeClients(): void {
    pplxModels.forEach((model) => {
        let bot = new XmppChatBot("pplx", model);
        bot.start();
    });
    modelfarmModels.forEach((model) => {
        let bot = new XmppChatBot("modelfarm", model);
        bot.start();
    });
};
