import { client, xml, IQCaller, JID } from "@xmpp/client";
import { pplxChatComplete, modelfarmChatComplete } from "./aiApi";
import xmlUtils from './xmlUtils';
import type { Element } from 'ltx';
import { Key } from './types';

interface PublishPublicKeyQuery {
    pubkey: string;
    from: string;
}

interface SetPubsubNodeConfigQuery {
    from: string;
}

interface GetPublicKeyQuery {
    from: string;
    to: string;
}

class XmppChatBot {
    private api: string;
    private model: string;
    private domain: string | undefined;
    private password: string | undefined;
    private xmpp: any; // Replace 'any' with the actual type of the XMPP client

    constructor(api: string, model: string) {
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

    private initializeEventHandlers(): void {
        this.xmpp.on("error", (err: Error) => console.error(err));
        this.xmpp.on("offline", () => console.log("offline"));
        this.xmpp.on("stanza", async (stanza: any) => this.handleStanza(stanza)); // Replace 'any' with the actual type of stanza
        this.xmpp.on("online", async (address: any) => this.handleOnline()); // Replace 'any' with the actual type of address
    }

    private async handleStanza(stanza: Element): Promise<void> {
        if (stanza.is("message")) {
            console.log("Received stanza:", stanza.toString());

            const from = stanza.attrs.from;
            const body = stanza.getChildText("body");

            if (body) {
                console.log("Message body:", body);
                let response: string | null;

                try {
                    if (this.api === "pplx") {
                        response = await pplxChatComplete(body, this.model);
                    } else if (this.api === "modelfarm") {
                        response = await modelfarmChatComplete(body);
                    } else {
                        console.error("Invalid API:", this.api);
                        return;
                    }

                    if (response) {
                        const responseMessage = xml(
                            "message",
                            { type: "chat", to: from },
                            xml("body", {}, response),
                        );

                        await this.xmpp.send(responseMessage);
                        console.log("Response sent to " + from);
                    }
                } catch (error) {
                    console.error("Error processing the message:", error);
                }
            }
        }
    }

    private async handleOnline(): Promise<void> {
        await this.xmpp.send(xml("presence"));
        console.log(`XMPP bot '${this.model}' ready at ${this.domain}...`);
    }

    public async start(): Promise<void> {
        this.xmpp.start().catch(console.error);
    }

    async fetchMemberPublicKey(memberId: string) {
        return new Promise<string>((resolve, reject) => {
            try {
                const { iqCaller, jid } = this.getQueryProperties()

                const onStanzaReceived = (stanza: Element) => {
                    if (!stanza.is('message')) return
                    if (stanza.getAttr('from') !== memberId) return
                    if (stanza.getAttr('type') !== 'headline') return

                    const pubkey = stanza
                        .getChild('event')
                        ?.getChild('items')
                        ?.getChild('item')
                        ?.getChildText('entry')

                    if (pubkey) {
                        resolve(pubkey.toString())
                    } else {
                        reject(
                            new Error(
                                `Failed to retrieve pubkey for ${memberId}`,
                            ),
                        )
                    }
                }
                this.xmpp.on('stanza', onStanzaReceived)

                const getPubkeyQueryXml = xmlUtils.buildQuery(
                    new GetPublicKeyQuery({
                        from: jid.toString(),
                        to: memberId,
                    }),
                )
                iqCaller.request(getPubkeyQueryXml).catch(reject)
            } catch (error) {
                console.log('fetchMemberPublicKey', error)
                reject(new Error('errors.unknown-error'))
            }
        })
    }

    async publishPublicKey(pubkey: Key) {
        try {
            const { iqCaller, jid } = this.getQueryProperties()
            const publishPubkeyQueryXml = xmlUtils.buildQuery(
                new PublishPublicKeyQuery({
                    pubkey: pubkey.hex,
                    from: jid.toString(),
                }),
            )
            const result = await iqCaller.request(publishPubkeyQueryXml)
            console.log('publishPublicKey', result)
            const setPubsubNodeConfigQueryXml = xmlUtils.buildQuery(
                new SetPubsubNodeConfigQuery({
                    from: jid.toString(),
                }),
            )
            await iqCaller.request(setPubsubNodeConfigQueryXml)
        } catch (error) {
            console.log('publishPublicKey', error)
            throw new Error('errors.unknown-error')
        }
    }

    private getQueryProperties(): { iqCaller: IQCaller; jid: JID } {
        // This method should return the properties needed for the queries.
        // Placeholder implementation - replace with actual logic.
        return {
            iqCaller: this.xmpp.iqCaller as IQCaller,
            jid: new JID(this.model, this.domain) // Assuming JID is a constructor that takes model and domain
        };
    }
}

export default XmppChatBot;
