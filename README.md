# trail-cam-tools

A set of utilities for handling trail cameras

## Rationale

There are a bunch of affordable trail cameras out there that have
pretty good video hardware and terrible software, especially if you
use Apple devices. Here are some of the issues I've seen:

- SD cards only store .AVI and .JPG files
- Video and image files are missing all timestamp metadata
- AVI files uses a non-standard encoder tag, so cannot be played with ffmpeg

Usually this manifests as a common error in ffmpeg:

```
[avi @ 0x6490844b6e40] unknown stream type 73647376
```

What this repository does is essentially convert a diectory of .AVI and .JPG
files, which is what's stored on the SD card, into tagged versions which are
encoded in a way that:

- They can be imported directly into Apple Photos
- Video files are transformed and encoded into .MP4
- Date and time metadata is incorporated, so files are properly sorted

Since internally the .AVI files use H.264 and PCM, we do not need to re-encode
the video, but we do need to encode the PCM audio (as PCM is not allowed in MPEG
standard video files). 

## Usage

```bash
$ recode <input_dir> <output_dir>
```

The structure of the output directory will generally follow that of the
input directory, whatever that is.

When done, the output directory should be able to be dragged directly into
Apple Photos, and "just work". 

## Dependencies

Requires the following command line tools to be available:

- `ffmpeg`
- `gpac`
- `exiftool`

This is because we rely on `gpac`'s ability to split .AVI files into audio and
video, which `ffmpeg` cannot do, as it does not accept the encoding tag. `ffmpeg`
is, however, much better at re-multiplexing them back into a new MPEG container.
And we need `exiftool` to fix the metadata tags.
