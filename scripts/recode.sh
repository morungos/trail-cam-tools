#!/bin/bash

## This script takes an AVI file that is on the trail camera's SD card, 
## splits the audio and the video using `gpac`, and then remuxes them
## properly using `ffmpeg`. The resulting mp4 file is safe for use in
## Apple Photos. However, at this stage, we still have no metadata, 
## because neither the JPG files nor the AVI files have any such data,
## at least, not that we can locate.
##
## This script should only be applied to transform AVI files. Anything
## else does not require this transform

FILENAME=$1
OUTPUT=$2

## Pull apart the streams
gpac -i "$FILENAME" -o "${FILENAME}.pcm" -o "${FILENAME}.h264"

## mux them back
ffmpeg -y \
  -f s16le -ar 16000 -ac 1 -i "${FILENAME}.pcm" \
  -i "${FILENAME}.h264" \
  -c:v copy -c:a aac \
  "$OUTPUT"
