import fs from 'fs/promises';
import path from 'path';

import mime from 'mime-types'

import type { ConfigData, Context } from './types.d.ts'

import logger from './logger'

import { program } from 'commander'
import { Level } from 'level'

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
