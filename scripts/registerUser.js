const { client, xml } = require("@xmpp/client");

// Function to register a new user
async function registerUser(domain, user, pass) {
    return new Promise((resolve, reject) => {
        const xmpp = client({
            service: `wss://${domain}/xmpp-websocket`,
            domain: domain,
            resource: "chat",
        });

        // Handle errors
        xmpp.on("error", (err) => {
            console.error(err);
            reject(err);
        });

        // Send registration request upon opening the connection
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

        // Handle server response to registration request
        xmpp.on("stanza", async (stanza) => {
            if (stanza.is("iq") && stanza.attrs.id === "register") {
                if (stanza.attrs.type === "result") {
                    resolve(true);
                } else {
                    reject(new Error(stanza.toString()));
                }
                await xmpp.stop();
            }
        });

        // Start the XMPP client
        xmpp.start().catch((err) => {
            reject(err);
        });
    });
}

// Command line arguments
const args = process.argv.slice(2);
if (args.length !== 3) {
    console.error("Usage: node registerUser.js <domain> <username> <password>");
    process.exit(1);
}
const domain = args[0];
const user = args[1];
const pass = args[2];

// Execute the registration function
registerUser(domain, user, pass)
    .then(() => {
        console.log("User registered successfully");
        process.exit(0);
    })
    .catch((err) => console.error("Error in registration:", err));
