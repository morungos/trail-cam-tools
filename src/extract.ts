// A single asynchronous module that effectively *really* gets the text
// from an image, or a video. This can be relatively slow, as we cache
// the output, and it'll be underpinned by something else. For now this 
// is implemented with AppleScript.

import path from 'node:path'
import { execFile } from 'node:child_process'

function get_script_file() {
    return path.resolve(__dirname, "../scripts/get-image-text.scpt");
}

export async function extract(file: string) {
    return new Promise((resolve, reject) => {
        execFile('osascript', [get_script_file(), file], (error, stdout, stderr) => {
            if (error) {
                return reject(error);
            }
            resolve(stdout);
        });
    })
}