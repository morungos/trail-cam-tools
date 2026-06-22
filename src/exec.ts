import { execFile } from 'node:child_process'

import logger from './logger'

export async function exec(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        logger.info("exec:", command, args.join(" "))
        execFile(command, args, (error, stdout, stderr) => {
            if (error) {
                return reject(error);
            }
            resolve(stdout);
        });
    })
}
