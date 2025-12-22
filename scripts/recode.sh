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

INROOT=$1
OUTROOT=$2
FILENAME=$3

## Make sure the output directory exists

INFILE="${INROOT}/${FILENAME}"
OUTFILE="${OUTROOT}/${FILENAME}"
OUTDIR="$(dirname "$OUTFILE")"

mkdir -p "${OUTDIR}"

## Pull apart the streams
gpac -i "${INFILE}" -o "${OUTFILE}.pcm" -o "${OUTFILE}.h264"

## mux them back, encoding the audio
ffmpeg -y \
  -f s16le -ar 16000 -ac 1 -i "${OUTFILE}.pcm" \
  -i "${OUTFILE}.h264" \
  -c:v copy -c:a aac \
  "${OUTFILE}"

## and remove the temporary files
rm "${OUTFILE}.pcm" "${OUTFILE}.h264"
