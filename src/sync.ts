import fs from 'node:fs/promises';
import path from 'node:path';

import { tmpName } from 'tmp-promise'
import mime from 'mime-types'
import { program } from 'commander'
import { Level } from 'level'
import { mkdirp } from 'mkdirp'
import { DateTime } from 'luxon'

import type { Context } from './types.d.ts'

import { exec } from './exec'
import logger from './logger'
import { extract } from './extract';

program
    .requiredOption('-t, --target <dir>', 'target directory is required')
    .requiredOption('-s, --source <dirs...>', 'at least one source directory is required')

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
            sources: program.opts().source,
            target: program.opts().target,
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

    logger.warn("match fail:", text, "for:", file)
}

function getRelativeTargetFile(time: string, type: string) {
    switch(type) {
        case "image/jpeg":
            return path.join(time.substring(0, 4), time.substring(0, 10), time + ".jpg")
        case "video/mp4":
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

async function writeFile(ctx: Context, file: string, absolute: string, time: string, type: string) {
    const fragment = getRelativeTargetFile(time, type)
    const output = path.resolve(ctx.config.target, fragment)
    await mkdirp(path.dirname(output))

    if (await safeStat(output)) {

        // If the file exists, don't copy, but do mark as cached, so we skip re-runs
        logger.info("Skipping; file already in target (exists):", absolute)
        await ctx.cache.put(absolute, time)
        return
    }

    await fs.copyFile(file, output)
    logger.info("Copying file to target:", absolute, 'as:', fragment)
    await ctx.cache.put(absolute, time)
}

async function syncFile(ctx: Context, source: string, absolute: string, type: string) {

    // If the resolved file entry already exists, we can skip all this
    const relative = path.relative(source, absolute)
    const keyTime = await ctx.cache.get(absolute)
    if (keyTime && await safeStat(path.resolve(ctx.config.target, getRelativeTargetFile(keyTime, type)))) {
        // All good, skip
        logger.info("Skipping; file already in target (cache):", absolute)
        return
    }

    logger.info("Processing; file not in target:", absolute)

    switch(type) {
        case "image/jpeg": {
            logger.info("Found JPEG image", absolute)
            const time = await getImageText(ctx, absolute)
            logger.info("Image timestamp:", time)
            if (time)
                await writeFile(ctx, absolute, absolute, time, type)
            break
        }

        case "video/mp4": {
            logger.info("Found MP4 video", absolute)
            const image = await getVideoImage(absolute)
            const time = await getImageText(ctx, image)
            await fs.rm(image)
            logger.info("Image timestamp:", time)
            if (time)
                await writeFile(ctx, absolute, absolute, time, type)
            break
        }

        case "video/x-msvideo": {
            logger.info("Found AVI video", absolute)
            const remuxed = await remux(absolute)
            const image = await getVideoImage(remuxed)
            const time = await getImageText(ctx, image)
            await fs.rm(image)
            logger.info("Image timestamp:", time)
            if (time)
                await writeFile(ctx, remuxed, absolute, time, type)
            break
        }

        default:
            logger.warn("Ignoring file:", absolute)
            break
    }
}

// The main top level function, which iterates through directories 
// searching for data.
async function processContent(ctx: Context, source: string, dir: string) {
    const directory = dir
    const files = await fs.readdir(directory, {
        withFileTypes: true,
        recursive: false
    })
    let i = 0
    for(const entry of files) {
        if (entry.isDirectory()) {
            logger.info("Found directory", path.resolve(dir, entry.name))
            await processContent(ctx, source, path.resolve(dir, entry.name))
        }
        if (! entry.isFile()) {
            continue
        }
        const extension = path.extname(entry.name)
        const type = mime.lookup(extension) || "application/octet-stream"
        const resolved = path.join(entry.parentPath, entry.name)

        await syncFile(ctx, source, resolved, type)
    }
}

/**
 * Updates the file timestamps for a target file, which can be either an image
 * or an (mp4) video.
 * @param ctx 
 * @param file 
 */
async function processTargetFile(ctx: Context, file: string) {
    const extension = path.extname(file)
    const type = mime.lookup(extension) || "application/octet-stream"
    const name = path.basename(file, extension)

    // Unpack the timestamp properly. TYhis is a fixed format, unlike what was
    // in the images. Note that this is a *local* time. We now need to turn that
    // into something we can pass to exiftool in a variety of different formats.

    const local = DateTime.fromFormat(name, "yyyy-LL-dd'T'HH-mm-ss")
    if (! local.isValid) {
        logger.warn("Skipping target file:", file)
        return
    }

    const utc = local.toUTC()

    // Generally, we need both a local time and a UTC time in an ISO-like format,
    // formatted for EXIF

    const localTime = local.toFormat("yyyy:LL:dd'T'HH:mm:ss")
    const utcTime = utc.toFormat("yyyy:LL:dd'T'HH:mm:ss")
    const localOffset = local.toFormat("ZZ")

    // Now we can generate and run the exiftool commands, depending on the file type
    switch(type) {
        case "image/jpeg": {
            logger.info("Updating JPEG image", file)

            await exec("exiftool", [
                "-overwrite_original", '-Make=Trail Camera', '-Model=SV-TCZ23LSW',
                `-AllDates=${localTime}`,
                `-EXIF:OffsetTime*=${localOffset}`,
                `${file}`
            ])

            break
        }

        // This bit is tricky, if we want compatibility with Apple Photos and
        // other things. We are not there yet with that. 

        case "video/mp4": {
            logger.info("Updating MP4 video", file)

            await exec("exiftool", [
                "-overwrite_original", 
                '-EXIF:Make=Trail Camera', 
                '-EXIF:Model=SV-TCZ23LSW',
                `-EXIF:DateTimeOriginal=${localTime}`,
                `-EXIF:CreateDate=${localTime}`,
                `-EXIF:ModifyDate=${localTime}`,
                '-QuickTime:Make=Trail Camera', 
                '-QuickTime:Model=SV-TCZ23LSW',
                '-QuickTime:Comment=SV-TCZ23LSW',
                `-QuickTime:CreateDate=${utcTime}`,
                `-QuickTime:ModifyDate=${utcTime}`,
                `-QuickTime:TrackCreateDate=${utcTime}`,
                `-QuickTime:TrackModifyDate=${utcTime}`,
                `-QuickTime:MediaCreateDate=${utcTime}`,
                `-QuickTime:MediaModifyDate=${utcTime}`,
                `${file}`
            ])

            break
        }

        default:
            logger.warn("Ignoring file:", file)
            break
    }
}

async function processTarget(ctx: Context, dir: string) {
    const directory = dir
    const files = await fs.readdir(directory, {
        withFileTypes: true,
        recursive: false
    })
    let i = 0
    for(const entry of files) {
        if (entry.isDirectory()) {
            logger.info("Found directory", path.resolve(dir, entry.name))
            await processTarget(ctx, path.resolve(dir, entry.name))
        }
        if (! entry.isFile()) {
            continue
        }
        await processTargetFile(ctx, path.resolve(dir, entry.name))
    }
}

// Now, for the final attempt, let's handle things as we need for video
// according to how the Canon system works, and we know it does work. 

async function sync(ctx: Context) {

    // First ensure the sources are reformatted into the target
    for(let s of ctx.config.sources) {
        await processContent(ctx, s, s)
    }

    // And then update the timestamps as needed
    await processTarget(ctx, ctx.config.target)
    
}

sync(makeContext())
