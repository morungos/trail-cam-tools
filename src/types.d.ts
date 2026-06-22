import type { Level } from 'level'

export type ConfigData = {
    source: string,
    target: string,
}

export type Context = {
    config: ConfigData,
    cache: Level
}

