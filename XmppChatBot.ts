import { client, xml } from "@xmpp/client";
import xmlUtils, {
  SetPubsubNodeConfigQuery,
  GetPublicKeyQuery,
  EncryptedDirectChatMessage,
} from "./xmlUtils";
import type { Element } from "ltx";
import { Keypair, ChatMessage } from "./types";
import encryptionUtils from "./EncryptionUtils";
// @ts-expect-error types don't expose this submodule
import parse from "@xmpp/xml/lib/parse";
import { v4 as uuidv4 } from "uuid";

class XmppChatBot {
  private name: string;
  private domain: string;
  private chatFunction: (
    message: string,
    model: string,
  ) => Promise<string | null>;
  private password: string;
  private xmpp: ReturnType<typeof client>;
  private keypair: Keypair;

  constructor(
    name: string,
    chatFunction: (message: string, model: string) => Promise<null | string>,
  ) {
    this.name = name;
    this.chatFunction = chatFunction;
    this.domain = process.env["DOMAIN"] ? process.env["DOMAIN"] : "localhost";
    this.password = process.env["BOT_PASSWORD"]
      ? process.env["BOT_PASSWORD"]
      : "password";

    this.xmpp = client({
      service: `wss://${this.domain}/xmpp-websocket`,
      domain: this.domain,
      resource: "chat",
      username: this.name,
      password: this.password,
    });

    // Keypair is generated here so we don't have to store it somewhere
    // TODO: fix this, should do it from a seed . Actually this was undefined when I first made it, need to update with Oscar
    this.keypair = encryptionUtils.generateDeterministicKeyPair(
      this.name + this.password,
    );

    this.initializeEventHandlers();

    this.xmpp.start().then(this.publishPublicKey).catch(console.error);
  }

  /**
   * Starts the XMPP client
   */
  async start() {
    await this.xmpp.start().catch(console.error);
  }

  /**
   * Sends a direct message to a recipient
   */
  async sendDirectMessage(
    recipientId: any, // TODO: Add Correct Type
    recipientPubkey: string,
    message: ChatMessage,
    senderKeys: Keypair,
    updatePayment: boolean,
    sendPushNotification?: boolean,
  ) {
    try {
      const { jid } = this.getQueryProperties();
      const fromJid = `${jid.getLocal()}@${jid.getDomain()}`;

      console.debug("message", message);
      console.debug("fromJid", fromJid);
      console.debug("recipientId", recipientId);

      const encrypedDirectChatMessageXml = xmlUtils.buildMessage(
        new EncryptedDirectChatMessage({
          from: fromJid,
          to: `${recipientId.jid._local}@${recipientId.jid._domain}`,
          message: message,
          // message: this.formatOutgoingMessage(message),
          senderKeys,
          recipientPublicKey: { hex: recipientPubkey },
          updatePayment,
          sendPushNotification,
        }),
      );

      await this.xmpp.send(encrypedDirectChatMessageXml);
    } catch (error) {
      console.log("sendDirectMessage", error);
      throw new Error("errors.unknown-error");
    }
  }

  /**
   * Fetches the public key of a member provided the member's id
   */
  async fetchMemberPublicKey(memberId: string) {
    return new Promise<string>((resolve, reject) => {
      try {
        const { iqCaller, jid } = this.getQueryProperties();

        const onStanzaReceived = (stanza: Element) => {
          if (
            !stanza.is("message") ||
            stanza.getAttr("from") !== memberId ||
            stanza.getAttr("type") !== "headline"
          )
            return;

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
        console.log("fetchMemberPublicKey", error);
        reject(new Error("errors.unknown-error"));
      }
    });
  }

  /**
   * Publishes the bot's public key to the pubsub node
   */
  async publishPublicKey() {
    try {
      const { iqCaller, jid } = this.getQueryProperties();
      // console.log('publishPublicKey: ', result)
      const setPubsubNodeConfigQueryXml = xmlUtils.buildQuery(
        new SetPubsubNodeConfigQuery({
          from: jid.toString(),
        }),
      );
      await iqCaller.request(setPubsubNodeConfigQueryXml);
    } catch (error) {
      console.log("publishPublicKey", error);
      throw new Error("errors.unknown-error");
    }
  }

  /**
   * Initializes the event handlers for the XMPP client
   */
  private initializeEventHandlers(): void {
    this.xmpp.on("error", (err: Error) => console.error(err));
    this.xmpp.on("offline", () => console.log("offline"));
    this.xmpp.on("stanza", async (stanza: any) => this.handleStanza(stanza)); // TODO: Replace 'any' with the actual type of stanza
    this.xmpp.on("online", async () => this.handleOnline());
  }

  /**
   * Handles incoming stanzas
   */
  private async handleStanza(stanza: Element): Promise<void> {
    if (stanza.is("message")) {
      console.log("Received stanza:", stanza.toString());

      const { parsedMessage, senderPublicKey } =
        this.decryptAndParseIncomingMessage(stanza);
      const { sentBy, sentTo } = parsedMessage;

      console.log("Parsed message:", parsedMessage);

      let message: string | null;

      try {
        message = await this.chatFunction(parsedMessage.content, this.name);

        if (message && senderPublicKey) {
          this.sendDirectMessage(
            parsedMessage.sentBy,
            senderPublicKey,
            this.formatOutgoingMessage({
              id: uuidv4(),
              sentBy: `${sentTo.jid._local}@${sentTo.jid._domain}`,
              sentTo: `${sentBy.jid._local}@${sentBy.jid._domain}`,
              sentAt: Date.now() / 1000,
              content: message,
            }),
            this.keypair,
            false,
            false,
          );
        }
      } catch (error) {
        console.error("Error processing the message:", error);
      }
    }
  }

  /**
   * Fires when the bot is online
   */
  private async handleOnline() {
    await this.xmpp.send(xml("presence"));
    console.log(`XMPP bot '${this.name}' ready at ${this.domain}...`);
  }

  /**
   * Decrypts and parses an incoming message
   */
  private decryptAndParseIncomingMessage(message: Element) {
    let directMessageJson: string | null;
    let action: Element | undefined;
    const encrypted = message.getChild("encrypted");
    let senderPublicKey: string | undefined;

    if (encrypted) {
      // First decrypt the payload
      const header = encrypted.getChild("header");
      const keys = header?.getChild("keys");
      senderPublicKey = keys?.getChildText("key") ?? undefined;

      if (!senderPublicKey) {
        throw new Error("Missing sender public key");
      }

      let encryptedPayloadContents = encrypted.getChildText("payload");

      const { privateKey } = this.keypair;

      const decryptedPayload = encryptionUtils.decryptMessage(
        encryptedPayloadContents as string,
        { hex: senderPublicKey },
        privateKey,
      );

      const decryptedEnvelope = parse(decryptedPayload);
      const content = decryptedEnvelope.getChild("content");

      if (!content) {
        throw new Error("Missing content in decrypted envelope");
      }
      directMessageJson = content.getChildText("dm");
      action = content.getChild("action");
    } else {
      // TODO: remove this... only left it in case it helps with backwards compatibility
      directMessageJson = message.getChildText("dm");
      action = message.getChild("action");
    }

    if (!directMessageJson) {
      throw new Error("Missing message JSON in message content");
    }

    // TODO: Validate the message matches the shape?
    const parsedMessage = JSON.parse(directMessageJson);

    return { parsedMessage, action, senderPublicKey };
  }

  /**
   * Formats an outgoing message to the expected format
   */
  private formatOutgoingMessage(message: ChatMessage) {
    const idToJidMember = (id: string) => {
      const [_local, rest] = id.split("@");
      const [_domain] = (rest || "").split("/");

      return {
        jid: { _local, _domain },
      };
    };

    const outgoing: any = {
      ...message,
      sentBy: idToJidMember(message.sentBy),
    };

    if (message.sentTo) {
      outgoing.sentTo = idToJidMember(message.sentTo);
    }

    return outgoing;
  }

  /**
   * Returns the query properties for the XMPP client
   */
  private getQueryProperties() {
    const { iqCaller, jid } = this.xmpp;

    if (!jid) throw new Error("No JID");

    return { iqCaller, jid };
  }
}

export default XmppChatBot;
