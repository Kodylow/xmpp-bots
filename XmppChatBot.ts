import { client, xml, IQCaller, JID } from "@xmpp/client";
import xmlUtils, { PublishPublicKeyQuery, SetPubsubNodeConfigQuery, GetPublicKeyQuery, EncryptedDirectChatMessage, GroupChatMessage } from './XmlUtils';
import type { Element } from 'ltx';
import { Key, Keypair, ChatMessage, ChatGroup, ChatMember } from './types';
import encryptionUtils from "./EncryptionUtils";
import parse from '@xmpp/xml/lib/parse'
import { v4 as uuidv4 } from 'uuid'
import { XMPP_MESSAGE_TYPES, XMPP_RESOURCE } from "./constants";

class XmppChatBot {
    private name: string;
    private domain: string;
    private chatFunction: (message: string, model: string) => Promise<string | null>;
    private password: string;
    private xmpp: ReturnType<typeof client>;
    private keypair: Keypair;

    constructor(name: string, chatFunction: (message: string, model: string) => Promise<null | string>) {
        this.name = name
        this.chatFunction = chatFunction;
        this.domain = process.env["DOMAIN"] ? process.env["DOMAIN"] : "localhost"; w
        this.password = process.env["BOT_PASSWORD"] ? process.env["BOT_PASSWORD"] : "password";

        this.xmpp = client({
            service: `wss://${this.domain}/xmpp-websocket`,
            domain: this.domain,
            resource: "chat",
            username: this.name,
            password: this.password,
        });

        // Keypair is generated here so we don't have to store it somewhere
        // Todo: fix this, should do it from a seed . Actually this was undefined when I first made it, need to update with Oscar
        this.keypair = encryptionUtils.generateDeterministicKeyPair(this.username + this.password);

        this.initializeEventHandlers()

        this.xmpp.start().then(() => {
            // Pubkey announcement on create, if already exists will be ignored
            this.publishPublicKey(this.keypair.publicKey);
        }).catch(console.error)


    }

    private initializeEventHandlers(): void {
        this.xmpp.on("error", (err: Error) => console.error(err));
        this.xmpp.on("offline", () => console.log("offline"));
        this.xmpp.on("stanza", async (stanza: any) => this.handleStanza(stanza)); // Replace 'any' with the actual type of stanza
        this.xmpp.on("online", async (address: any) => this.handleOnline()); // Replace 'any' with the actual type of address
    }

    private async handleStanza(stanza: Element): Promise<void> {
        if (stanza.is("message")) {
            switch (stanza.getAttr('type')) {
                // Handle incoming messages from GroupChat
                case XMPP_MESSAGE_TYPES.GROUPCHAT: {
                    return this.handleIncomingGroupMessage(stanza)
                }
                // Handle incoming messages from DirectChat while online
                case XMPP_MESSAGE_TYPES.CHAT: {
                    return this.handleIncomingDirectMessage(stanza)
                }
                // Handle incoming messages after subscribing to user
                // public key for e2e encryption
                // case XMPP_MESSAGE_TYPES.HEADLINE: {
                //     return this.handleSubscriptionEvent(stanza)
                // }
            }
        }
    }

    // Fedi-encrypted XMPP messages contain a <encrypted> with the message
    // <encrypted>
    //   <header>
    //     <keys>
    //   </header>
    //   <payload>
    //     ...
    //   </payload>
    // </encrypted>
    private async handleIncomingDirectMessage(stanza: Element): Promise<void> {
        const { parsedMessage, action, senderPublicKey } = this.decryptAndParseIncomingMessage(stanza)
        const { sentBy, sentTo } = parsedMessage

        console.log("Parsed message:", parsedMessage)

        let message: string | null;

        try {
            message = await this.chatFunction(parsedMessage.content, this.name)

            if (message) {
                this.sendDirectMessage(
                    parsedMessage.sentBy,
                    senderPublicKey,
                    this.formatOutgoingMessage({
                        id: uuidv4(),
                        sentBy: `${sentTo.jid._local}@${sentTo.jid._domain}`,
                        sentTo: `${sentBy.jid._local}@${sentBy.jid._domain}`,
                        sentAt: Date.now() / 1000,
                        content: message
                    }),
                    this.keypair,
                    false,
                    false,
                )
            }
        } catch (error) {
            console.error("Error processing the message:", error);
        }
    }

    private handleIncomingGroupMessage(stanza: Element) {
        const bodyText = stanza.getChildText('body')
        if (!bodyText) return

        const groupMessageJson = stanza.getChildText('gm')
        const parsedMessage = JSON.parse(groupMessageJson as string)
        if (!parsedMessage || !parsedMessage.content) return

        // If parsed message starts with /name , then it's a slash command to invoke this bot
        if (parsedMessage.content.startsWith('/' + this.name)) {
            const command = parsedMessage.content.replace('/' + this.name, '')
            const message = this.chatFunction(command, this.name)
            this.sendGroupMessage(
                stanza

            // // Emit a 'message'
            // this.emit('message', this.formatIncomingMessage(parsedMessage))

            // Emit a 'memberSeen' for the person who sent it in case we hadn't seen them before
            // MUC `from` is formatted differently than direct chat jids: [roomId]@[domain]/[memberName]
            // const from = stanza.getAttr('from')
            // if (from) {
            //     const fromJid = makeJid(from)
            //     const memberJid = makeJid(
            //         fromJid.getResource(),
            //         fromJid.getDomain().replace('muc.', ''),
            //         XMPP_RESOURCE,
            //     )
            //     this.emit('memberSeen', this.memberFromJid(memberJid.toString()))
            // }
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private formatIncomingMessage(rawMessage: any): ChatMessage {
        const formatIncomingEntity = (
            sentEntity:
                | string
                | { id: string }
                | { jid: { _local: string; _domain: string } }
                | undefined,
        ) => {
            if (!sentEntity) return undefined
            if (typeof sentEntity === 'string') return sentEntity
            if ('id' in sentEntity) return sentEntity.id
            if ('jid' in sentEntity)
                return `${sentEntity.jid._local}@${sentEntity.jid._domain}`
        }

        const sentBy = formatIncomingEntity(rawMessage.sentBy)
        if (!sentBy) {
            throw new Error('Incoming message missing sentBy')
        }

        const payment = rawMessage.payment
            ? { ...rawMessage.payment }
            : undefined
        if (payment?.recipient) {
            payment.recipient = formatIncomingEntity(payment.recipient)
        }

        return {
            id: rawMessage.id,
            content: rawMessage.content,
            sentAt: rawMessage.sentAt,
            sentBy,
            sentTo: formatIncomingEntity(rawMessage.sentTo),
            sentIn: formatIncomingEntity(rawMessage.sentIn),
            payment,
        }
    }

    private async handleOnline(): Promise<void> {
        await this.xmpp.send(xml("presence"));
        console.log(`XMPP bot '${this.name}' ready at ${this.domain}...`);
    }

    public async start(): Promise<void> {
        this.xmpp.start().catch(console.error);
    }

    async sendDirectMessage(
        recipientId: string,
        recipientPubkey: string,
        message: ChatMessage,
        senderKeys: Keypair,
        updatePayment: boolean,
        sendPushNotification?: boolean,
    ) {
        try {
            const { jid } = this.getQueryProperties()
            const fromJid = `${jid.getLocal()}@${jid.getDomain()}`

            console.debug('message', message)
            console.debug('fromJid', fromJid)
            console.debug('recipientId', recipientId)


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
            )

            await this.xmpp.send(encrypedDirectChatMessageXml)
        } catch (error) {
            console.log('sendDirectMessage', error)
            throw new Error('errors.unknown-error')
        }
    }

    async sendGroupMessage(group: Partial<ChatGroup>, message: ChatMessage) {
        return new Promise<void>((resolve, reject) => {
            try {
                const { jid } = this.getQueryProperties()
                const fromJid = jid.toString()
                const toGroup = `${group.id}@muc.${jid.getDomain()}`

                const groupChatMessageXml = xmlUtils.buildMessage(
                    new GroupChatMessage({
                        from: fromJid,
                        to: toGroup,
                        message: this.formatOutgoingGroupMessage(
                            message,
                            group,
                        ),
                    }),
                )

                const onStanzaReceived = async (stanza: Element) => {
                    if (
                        !stanza.is('message') ||
                        stanza.getAttr('id') !==
                        groupChatMessageXml.getAttr('id')
                    )
                        return

                    // Check for if the message has an error attached
                    const error = stanza.getChild('error')
                    if (error) {
                        const errorText = error.getChildText('text')
                        reject(new Error(errorText || 'errors.unknown-error'))
                    } else {
                        resolve()
                    }
                    this.xmpp.removeListener('stanza', onStanzaReceived)
                }
                this.xmpp.on('stanza', onStanzaReceived)

                this.xmpp.send(groupChatMessageXml).catch(reject)
            } catch (error) {
                console.error('sendGroupMessage', error)
                reject(new Error('errors.unknown-error'))
            }
        })
    }

    private decryptAndParseIncomingMessage(message: Element) {
        let directMessageJson: string | null
        let action: Element | undefined
        const encrypted = message.getChild('encrypted')
        let senderPublicKey: string | undefined
        if (encrypted) {
            // First decrypt the payload
            const header = encrypted.getChild('header')
            const keys = header?.getChild('keys')
            senderPublicKey = keys?.getChildText('key')
            if (!senderPublicKey) {
                throw new Error('Missing sender public key')
            }

            let encryptedPayloadContents = encrypted.getChildText('payload')

            const { privateKey, publicKey } = this.keypair

            const decryptedPayload = encryptionUtils.decryptMessage(
                encryptedPayloadContents as string,
                { hex: senderPublicKey },
                privateKey,
            )

            const decryptedEnvelope = parse(decryptedPayload)
            const content = decryptedEnvelope.getChild('content')
            if (!content) {
                throw new Error('Missing content in decrypted envelope')
            }
            directMessageJson = content.getChildText('dm')
            action = content.getChild('action')
        } else {
            // TODO: remove this... only left it in case it helps with
            // backwards compatibility
            directMessageJson = message.getChildText('dm')
            action = message.getChild('action')
        }

        if (!directMessageJson) {
            throw new Error('Missing message JSON in message content')
        }

        // TODO: Validate the message matches the shape?
        const parsedMessage = JSON.parse(directMessageJson)
        return { parsedMessage, action, senderPublicKey }
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
            // console.log('publishPublicKey: ', result)
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

    private formatOutgoingMessage(message: ChatMessage) {
        const idToJidMember = (id: string) => {
            const [_local, rest] = id.split('@')
            const [_domain] = (rest || '').split('/')
            return {
                jid: { _local, _domain },
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const outgoing: any = {
            ...message,
            sentBy: idToJidMember(message.sentBy),
        }
        if (message.sentTo) {
            outgoing.sentTo = idToJidMember(message.sentTo)
        }
        // if (message.payment) {
        //     if (message.payment.recipient) {
        //         outgoing.payment = {
        //             ...outgoing.payment,
        //             recipient: idToJidMember(message.payment.recipient),
        //         }
        //     }
        // }

        return outgoing
    }

    async sendGroupMessage(group: Partial<ChatGroup>, message: ChatMessage) {
        return new Promise<void>((resolve, reject) => {
            try {
                const { jid } = this.getQueryProperties()
                const fromJid = jid.toString()
                const toGroup = `${group.id}@muc.${jid.getDomain()}`

                const groupChatMessageXml = xmlUtils.buildMessage(
                    new GroupChatMessage({
                        from: fromJid,
                        to: toGroup,
                        message: this.formatOutgoingGroupMessage(
                            message,
                            group,
                        ),
                    }),
                )

                const onStanzaReceived = async (stanza: Element) => {
                    if (
                        !stanza.is('message') ||
                        stanza.getAttr('id') !==
                        groupChatMessageXml.getAttr('id')
                    )
                        return

                    // Check for if the message has an error attached
                    const error = stanza.getChild('error')
                    if (error) {
                        const errorText = error.getChildText('text')
                        reject(new Error(errorText || 'errors.unknown-error'))
                    } else {
                        resolve()
                    }
                    this.xmpp.removeListener('stanza', onStanzaReceived)
                }
                this.xmpp.on('stanza', onStanzaReceived)

                this.xmpp.send(groupChatMessageXml).catch(reject)
            } catch (error) {
                console.error('sendGroupMessage', error)
                reject(new Error('errors.unknown-error'))
            }
        })
    }

    private formatOutgoingGroupMessage(
        message: ChatMessage,
        group: Partial<ChatGroup>,
    ) {
        return {
            ...this.formatOutgoingMessage(message),
            sentIn: {
                id: group.id,
                name: group.name,
            },
        }
    }

    private memberFromJid(jidString: string): ChatMember {
        console.log("Jid string: ", jidString)
        const id = jidString.split('/')[0]
        return {
            id,
            username: id.split('@')[0],
        }
    }

    private getQueryProperties() {
        const { iqCaller, jid } = this.xmpp
        if (!jid) throw new Error('No JID')
        return { iqCaller, jid }
    }

    // private getQueryProperties(): { iqCaller: IQCaller; jid: JID } {
    //     // This method should return the properties needed for the queries.
    //     // Placeholder implementation - replace with actual logic.
    //     return {
    //         iqCaller: this.xmpp.iqCaller as IQCaller,
    //         jid: new JID(this.model, this.domain) // Assuming JID is a constructor that takes model and domain
    //     };
    // }
}

export default XmppChatBot;


// Unencrypted XMPP messages contain a <body> with the message
// const body = stanza.getChildText("body");
// if (body) {
//     console.log("Message body:", body);
//     let message: string | null;

//     try {
//         if (this.api === "pplx") {
//             message = await pplxChatComplete(body, this.model);
//         } else if (this.api === "modelfarm") {
//             message = await modelfarmChatComplete(body);
//         } else {
//             console.error("Invalid API:", this.api);
//             return;
//         }

//         if (response) {
//             const responseMessage = xml(
//                 "message",
//                 { type: "chat", to: from },
//                 xml("body", {}, response),
//             )

//             await this.xmpp.send(responseMessage);
//             console.log("Response sent to " + from);
//         }
//     } catch (error) {
//         console.error("Error processing the message:", error);
//     }
// }