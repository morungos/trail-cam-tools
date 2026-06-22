import fs from 'fs/promises';
import path from 'path';

import mime from 'mime-types'

import type { ConfigData, Context } from './types.d.ts';

import logger from './logger'

function makeContext(): Context {
    return {
        config: {
            source: "",
            target: ""
        }
    };
}

async function processContent(ctx: Context) {
    const directory = ctx.config.source
    const files = await fs.readdir(directory, {
        withFileTypes: true,
        recursive: false
    })
    let i = 0
    for(const entry of files) {
        if (! entry.isFile) {
            continue
        }
        const extension = path.extname(entry.name)
        const type = mime.lookup(extension);
        const resolved = path.join(entry.parentPath, entry.name);
        switch(type) {
            case "image/jpeg":
            case "image/png":
            case "image/gif":
            case "image/webp":
                logger.info("Found image", resolved)
                break

            default:
                break;
        }
    }
}

async function sync(ctx: Context) {

}

sync(makeContext())
