import type { Level } from 'level'

export type ConfigData = {
    sources: string[],
    target: string,
}

export type Context = {
    config: ConfigData,
    cache: Level
}

