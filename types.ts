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