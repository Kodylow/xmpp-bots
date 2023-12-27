const { client, xml } = require("@xmpp/client");
const { pplxChatComplete, modelfarmChatComplete } = require("./aiApi");

class XmppChatBot {
  constructor(api, model) {
    this.api = api;
    this.model = model;
    this.domain = process.env["DOMAIN"];
    this.password = process.env["BOT_PASSWORD"];

    this.xmpp = client({
      service: `wss://${this.domain}/xmpp-websocket`,
      domain: this.domain,
      resource: "chat",
      username: this.model,
      password: this.password,
    });

    this.initializeEventHandlers();
  }

  initializeEventHandlers() {
    this.xmpp.on("error", (err) => console.error(err));
    this.xmpp.on("offline", () => console.log("offline"));
    this.xmpp.on("stanza", async (stanza) => this.handleStanza(stanza));
    this.xmpp.on("online", async (address) => this.handleOnline());
  }

  async handleStanza(stanza) {
    if (stanza.is("message")) {
      console.log("Received stanza:", stanza.toString());

      const from = stanza.attrs.from;
      const body = stanza.getChildText("body");

      if (body) {
        console.log("Message body:", body);
        let response;

        try {
          if (this.api === "pplx") {
            response = await pplxChatComplete(body, this.model);
          } else if (this.api === "modelfarm") {
            response = await modelfarmChatComplete(body);
          } else {
            console.error("Invalid API:", this.api);
            return;
          }
          const responseMessage = xml(
            "message",
            { type: "chat", to: from },
            xml("body", {}, response),
          );

          await this.xmpp.send(responseMessage);
          console.log("Response sent to " + from);
        } catch (error) {
          console.error("Error processing the message:", error);
        }
      }
    }
  }

  async handleOnline() {
    await this.xmpp.send(xml("presence"));
    console.log(`XMPP bot '${this.model}' ready at ${this.domain}...`);
  }

  async start() {
    this.xmpp.start().catch(console.error);
  }

  async publishPublicKey(pubkey) {
    try {
      const { iqCaller, jid } = this.getQueryProperties();
      const publishPubkeyQueryXml = xmlUtils.buildQuery(
        new PublishPublicKeyQuery({
          pubkey: pubkey.hex,
          from: jid.toString(),
        }),
      );
      const result = await iqCaller.request(publishPubkeyQueryXml);
      console.info("publishPublicKey", result);
      const setPubsubNodeConfigQueryXml = xmlUtils.buildQuery(
        new SetPubsubNodeConfigQuery({
          from: jid.toString(),
        }),
      );
      await iqCaller.request(setPubsubNodeConfigQueryXml);
    } catch (error) {
      console.error("publishPublicKey", error);
      throw new Error("errors.unknown-error");
    }
  }

  async fetchMemberPublicKey(memberId) {
    return new Promise((resolve, reject) => {
      try {
        const { iqCaller, jid } = this.getQueryProperties();

        const onStanzaReceived = (stanza) => {
          if (!stanza.is("message")) return;
          if (stanza.getAttr("from") !== memberId) return;
          if (stanza.getAttr("type") !== "headline") return;

          const pubkey = stanza
            .getChild("event")
            ?.getChild("items")
            ?.getChild("item")
            ?.getChildText("entry");

          if (pubkey) {
            resolve(pubkey.toString());
          } else {
            reject(new Error(`Failed to retrieve pubkey for ${memberId}`));
          }
        };
        this.xmpp.on("stanza", onStanzaReceived);

        const getPubkeyQueryXml = xmlUtils.buildQuery(
          new GetPublicKeyQuery({
            from: jid.toString(),
            to: memberId,
          }),
        );
        iqCaller.request(getPubkeyQueryXml).catch(reject);
      } catch (error) {
        console.error("fetchMemberPublicKey", error);
        reject(new Error("errors.unknown-error"));
      }
    });
  }
}

module.exports = XmppChatBot;
