const { client, xml } = require("@xmpp/client");

const sendMessage = async (domain, user, msg, resp = false) => {
    const username = "kodytest"; // Sender username
    const password = "test"; // Sender password

    const recipient = `${user}@${domain}`; // The recipient of the message

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

    xmpp.on("online", async (address) => {
        console.log("Connected as " + address);

        // Constructing the message stanza
        const message = xml(
            "message",
            { type: "chat", to: recipient },
            xml("body", {}, msg),
        );

        // Send the message
        await xmpp.send(message);
        console.log("Message sent to " + recipient);

        // If response is required, set up a listener for incoming messages
        if (resp) {
            xmpp.on("stanza", async (stanza) => {
                if (stanza.is("message") && stanza.getChild("body")) {
                    console.log("Received response:", stanza.getChildText("body"));
                    await xmpp.stop();
                }
            });
        } else {
            await xmpp.stop();
        }
    });

    xmpp.start().catch(console.error);
};

// Command line arguments
const args = process.argv.slice(2);
console.log(args);
if (args.length == 3 || args.length == 4) {
    const domain = args[0];
    const user = args[1];
    const msg = args[2];
    const resp = args[3] === "true";
    console.log("resp:", resp);
    sendMessage(domain, user, msg, resp);
} else {
    console.error(
        "Usage: node sendMsg.js <domain> <username> <message> <awaitResponseBool>",
    );
    process.exit(1);
}
