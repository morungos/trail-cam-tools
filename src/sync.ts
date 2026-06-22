import fs from 'fs/promises';
import path from 'path';

import mime from 'mime-types'
import { program } from 'commander'
import { Level } from 'level'

import type { Context } from './types.d.ts'

import logger from './logger'

program
    .argument('<source>')
    .argument('<target>')

// For persistence, we will use level. That's enough: all we need
// is a key value store with a JSON data block containing a timestamp
// and extracted (raw) text. Particularly for videos, this is much more
// efficient than re-extracting the text every single time.

function makeContext(): Context {

    program.parse()
    const cache = new Level('.text-cache', { valueEncoding: 'json' })

    return {
        config: {
            source: program.args[0],
            target: program.args[1],
            cache: cache
        }
    };
}

// The main top level function, which iterates through directories 
// searching for data.
async function processContent(ctx: Context, source: string) {
    const directory = source
    const files = await fs.readdir(directory, {
        withFileTypes: true,
        recursive: false
    })
    let i = 0
    for(const entry of files) {
        if (entry.isDirectory()) {
            logger.info("Found directory", entry.name)
            await processContent(ctx, path.resolve(source, entry.name))
        }
        if (! entry.isFile()) {
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

            case "video/mp4":
                logger.info("Found MP4 video", resolved)
                break

            default:
                logger.info("Ignoring:", entry, type)
                break
        }
    }
}

async function sync(ctx: Context) {
    await processContent(ctx, ctx.config.source)
}

sync(makeContext())
