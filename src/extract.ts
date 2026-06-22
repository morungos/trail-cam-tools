// A single asynchronous module that effectively *really* gets the text
// from an image, or a video. This can be relatively slow, as we cache
// the output, and it'll be underpinned by something else. For now this 
// is implemented with AppleScript.

import path from 'node:path'
import fs from 'node:fs/promises'

import { tmpName } from 'tmp-promise'

import { exec } from './exec'

function get_script_file() {
    return path.resolve(__dirname, "../scripts/get-image-text.applescript");
}

async function thresholdImage(file: string): Promise<string> {
    const output = await tmpName({ postfix: '.jpg'})
    await exec('magick', [file, "-colorspace", "Gray", "-black-threshold", "85%", output])
    return output
}

async function getImageText(file: string): Promise<string> {
    const output = await exec('osascript', [get_script_file(), file])
    return output ?? ""
}

/**
 * Extracts the image text. We use both AppleScript and ImageMagick.
 * @param file 
 * @returns 
 */
export async function extract(file: string): Promise<string> {
    const transformed = await thresholdImage(file)
    const text = await getImageText(transformed)

    // remove the image scratch file
    await fs.rm(transformed)
    return text
}
