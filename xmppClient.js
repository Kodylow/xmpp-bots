const { client, xml } = require("@xmpp/client");
const { pplxChatComplete, modelfarmChatComplete } = require("./aiApi");

module.exports = function (api, model) {
  const domain = process.env["DOMAIN"];
  const password = process.env["BOT_PASSWORD"]; // Assuming same password for all clients

  const xmpp = client({
    service: `wss://${domain}/xmpp-websocket`,
    domain: domain,
    resource: "chat",
    username: model,
    password: password,
  });

  xmpp.on("error", (err) => {
    console.error(err);
  });

  xmpp.on("offline", () => {
    console.log("offline");
  });

  xmpp.on("stanza", async (stanza) => {
    if (stanza.is("message")) {
      console.log("Received stanza:", stanza.toString());

      const from = stanza.attrs.from;
      const body = stanza.getChildText("body");

      if (body) {
        console.log("Message body:", body);
        let response;

        try {
          if (api === "pplx") {
            response = await pplxChatComplete(body, model);
          } else if (api === "modelfarm") {
            response = await modelfarmChatComplete(body);
          } else {
            console.error("Invalid API:", api);
            return;
          }
          const responseMessage = xml(
            "message",
            { type: "chat", to: from },
            xml("body", {}, response),
          );

          await xmpp.send(responseMessage);
          console.log("Response sent to " + from);
        } catch (error) {
          console.error("Error processing the message:", error);
        }
      }
    }
  });

  xmpp.on("online", async (address) => {
    // Makes itself available
    await xmpp.send(xml("presence"));

    console.log(`XMPP bot '${model}' ready at ${domain}...`);
  });

  xmpp.start().catch(console.error);
};
