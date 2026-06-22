import type { Level } from 'level'

export type ConfigData = {
    source: string,
    target: string,
    cache: Level
}

export type Context = {
    config: ConfigData,
}

