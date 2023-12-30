export interface Key {
    hex: string
}

export interface Keypair {
    publicKey: Key
    privateKey: Key
}

export type ArchiveQueryFilters = {
    withJid?: string | null
}

export type ArchiveQueryPagination = {
    limit?: string | null
    after?: string | null
}

export interface ChatGroup {
    id: string
    name: string
    joinedAt: number
    broadcastOnly?: boolean
}

export interface XmppChatMember extends ChatMember {
    jid: string
}

export interface ChatGroupSettings {
    members: ChatMember[]
    // What can admins do that members can't (if anything)?
    // Enable payments? Show message history?
    // Consider instead a "creator: Member" field here
    admins: ChatMember[]
    paymentsEnabled: boolean
    // Consider instead a shareMessageHistory boolean
    // because each Member would request and store any Messages
    // from other Members upon joining a Group
    showMessageHistory: boolean
}

export interface ChatPayment {
    amount: MSats
    status: ChatPaymentStatus
    // TODO: Improve types here. Status should dictate
    // which properties are undefined and which are present.
    recipient?: string
    updatedAt?: number
    memo?: string
    token?: string | null
    // invoice?: Invoice
}

export enum ChatPaymentStatus {
    accepted,
    requested,
    canceled,
    rejected,
    paid,
}

export interface ChatMember {
    /** Unique ID for the member (same as username for xmpp) */
    id: string
    username: string
    publicKeyHex?: string
}

export enum ChatMessageStatus {
    sent, // 0
    failed, // 1
    queued, // 2
}

export interface ChatMessage {
    id: string
    content: string
    sentAt: number
    sentBy: ChatMember['id']
    /** Only present on group messages */
    sentIn?: ChatGroup['id']
    /** Only present on direct messages */
    sentTo?: ChatMember['id']
    /** Only present on chat payment messages */
    payment?: ChatPayment
    /** Only present locally on messages sent from us */
    status?: ChatMessageStatus
}