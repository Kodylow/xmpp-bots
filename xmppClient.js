const { client, xml } = require("@xmpp/client");
const pplxChatComplete = require("./pplxApi");

module.exports = function (username) {
  const domain = process.env["DOMAIN"];
  const password = process.env["BOT_PASSWORD"]; // Assuming same password for all clients

  const xmpp = client({
    service: `wss://${domain}/xmpp-websocket`,
    domain: domain,
    resource: "chat",
    username: username,
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

        try {
          let pplxChatResponse = await pplxChatComplete(body);
          const responseMessage = xml(
            "message",
            { type: "chat", to: from },
            xml("body", {}, pplxChatResponse),
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

    console.log(`XMPP bot '${username}' ready at ${domain}...`);
  });

  xmpp.start().catch(console.error);
};
