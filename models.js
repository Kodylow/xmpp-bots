const xmppClient = require("./xmppClient");

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

module.exports = function initializeClients() {
  pplxModels.forEach((model) => {
    xmppClient("pplx", model);
  });
  modelfarmModels.forEach((model) => {
    xmppClient("modelfarm", model);
  });
};
