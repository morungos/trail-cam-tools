import fs from 'node:fs/promises';
import path from 'node:path';

import { tmpName } from 'tmp-promise'
import mime from 'mime-types'
import { program } from 'commander'
import { Level } from 'level'
import { mkdirp } from 'mkdirp'

import type { Context } from './types.d.ts'

import { exec } from './exec'
import logger from './logger'
import { extract } from './extract';

program
    .argument('<source>')
    .argument('<target>')

// For persistence, we will use level. That's enough: all we need is a key value
// store with a JSON data block containing a timestamp and extracted (raw) text.
// Particularly for videos, this is much more efficient than re-extracting the
// text every single time.
//
// Annoyingly, there is some circularity in the way we need to process, and
// basically, we need a file cache. The issue is, we cannot peek at the
// timestamp of the AVI file until we have remuxed it. But we cannot cache the
// file sensibly without that key. So we kind of need to keep that remuxed video
// file and retain it until we have a timestamp. 

function makeContext(): Context {

    program.parse()
    const cache = new Level('.text-cache', { valueEncoding: 'json' })

    return {
        config: {
            source: program.args[0],
            target: program.args[1],
        },
        cache: cache
    };
}

async function getFileKey(ctx: Context, file: string, type: string) {

}

async function remux(file: string): Promise<string> {
    
    const audio = await tmpName({ postfix: '.pcm'})
    const video = await tmpName({ postfix: '.h264'})
    const mp4 = await tmpName({ postfix: '.mp4'})
    await exec("gpac", ["-i", file, "-o", audio, "-o", video])
    await exec("ffmpeg", ["-y", "-f", "s16le", "-ar", "16000", "-ac", "1", "-i", audio, "-r", "25", "-i", video, "-c:v", "copy", "-c:a", "aac", mp4])

    // remove the image scratch file
    await fs.rm(audio)
    await fs.rm(video)

    return mp4
}

async function getVideoImage(file: string): Promise<string> {
    const output = await tmpName({ postfix: 'jpg'})
    await exec("ffmpeg", ["-y", "-i", file, "-vframes", "1", "-f", "image2", output])
    return output
}

/**
 * Reads the image text. A timestamp is returned, which *must* be in the 24 hour block, with
 * hyphens rather than colons, i.e., like 2025-07-07T14-57-33
 * @param ctx 
 * @param file 
 * @returns 
 */
async function getImageText(ctx: Context, file: string) {
    const text = await extract(file);
    let match;

    if ((match = /([0-3][0-9])\/([0-1][0-9])\/(2[0-9][0-9][0-9])(?:\n|[: ])+([0-2][0-9])\:([0-5][0-9])\:([0-5][0-9])/s.exec(text))) {
        return `${ match[3] }-${ match[2] }-${ match[1] }T${ match[4] }-${ match[5] }-${ match[6] }`
    }

    logger.warn("match fail:", text)
    process.exit(1)
}

function getRelativeTargetFile(time: string, type: string) {
    switch(type) {
        case "image/jpeg":
            return path.join(time.substring(0, 4), time.substring(0, 10), time + ".jpg")
        case "video/x-msvideo":
            return path.join(time.substring(0, 4), time.substring(0, 10), time + ".mp4")
        default:
            throw new Error("Invalid type: " + type)
    }
}

async function safeStat(file: string) {
    try {
        return await fs.stat(file)
    } catch (e: any) {
        return undefined
    }
}

async function syncFile(ctx: Context, resolved: string, type: string) {

    // If the resolved file entry already exists, we can skip all this
    const relative = path.relative(ctx.config.source, resolved)
    const keyTime = await ctx.cache.get(relative)
    if (keyTime && await safeStat(path.resolve(ctx.config.target, getRelativeTargetFile(keyTime, type)))) {
        // All good, skip
        logger.info("Skipping", relative)
        return
    }

    switch(type) {
        case "image/jpeg": {
            logger.info("Found JPEG image", resolved)
            const time = await getImageText(ctx, resolved)
            logger.info("time:", time)
            const output = path.resolve(ctx.config.target, getRelativeTargetFile(time, type))
            await mkdirp(path.dirname(output))
            await fs.copyFile(resolved, output)
            await ctx.cache.put(relative, time)
            break
        }

        case "video/x-msvideo": {
            logger.info("Found AVI video", resolved)
            const remuxed = await remux(resolved)
            const image = await getVideoImage(remuxed)
            const time = await getImageText(ctx, image)
            await fs.rm(image)
            logger.info("time:", time)
            const output = path.resolve(ctx.config.target, getRelativeTargetFile(time, type))
            await mkdirp(path.dirname(output))
            await fs.copyFile(remuxed, output)
            await ctx.cache.put(relative, time)
            break
        }

        default:
            logger.warn("Ignoring file:", resolved)
            break
    }
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
        const type = mime.lookup(extension) || "application/octet-stream"
        const resolved = path.join(entry.parentPath, entry.name)

        await syncFile(ctx, resolved, type)
    }
}

async function sync(ctx: Context) {
    await processContent(ctx, ctx.config.source)
}

sync(makeContext())
