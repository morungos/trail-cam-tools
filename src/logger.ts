export function info(text: string, ...args: any[]) {
    console.log.apply(console, [text].concat(args));
}

export function debug(text: string, ...args: any[]) {
    return
}

export default {
    info,
    debug
}
