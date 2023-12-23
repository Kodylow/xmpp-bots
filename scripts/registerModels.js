require("dotenv").config();
const { client, xml } = require("@xmpp/client");

// Function to register a new user
async function registerUser(domain, user, pass) {
  return new Promise((resolve, reject) => {
    const xmpp = client({
      service: `wss://${domain}/xmpp-websocket`,
      domain: domain,
      resource: "chat",
    });

    xmpp.on("error", (err) => {
      console.error(err);
      reject(err);
    });

    xmpp.on("open", () => {
      xmpp.send(
        xml(
          "iq",
          { type: "set", to: domain, id: "register" },
          xml(
            "query",
            { xmlns: "jabber:iq:register" },
            xml("username", {}, user),
            xml("password", {}, pass),
          ),
        ),
      );
    });

    xmpp.on("stanza", async (stanza) => {
      if (stanza.is("iq") && stanza.attrs.id === "register") {
        if (stanza.attrs.type === "result") {
          console.log(`User ${user} registered successfully`);
          resolve(true);
        } else {
          reject(
            new Error(
              `Registration failed for user ${user}: ${stanza.toString()}`,
            ),
          );
        }
        await xmpp.stop();
      }
    });

    xmpp.start().catch((err) => {
      reject(err);
    });
  });
}

async function registerAllUsers() {
  const domain = process.env["DOMAIN"];
  const pass = process.env["BOT_PASSWORD"];
  const models = [
    // PPLX
    "pplx-7b-chat",
    "pplx-70b-chat",
    "pplx-7b-online",
    "pplx-70b-online",
    "llama-2-70b-chat",
    "codellama-34b-instruct",
    "mistral-7b-instruct",
    "mixtral-8x7b-instruct",
    // Modelfarm
    "modelfarm",
  ];

  for (const user of models) {
    try {
      await registerUser(domain, user, pass);
    } catch (error) {
      console.error(error);
    }
  }
}

registerAllUsers();
