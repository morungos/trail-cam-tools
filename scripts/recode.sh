#!/bin/bash
set -x

## This script takes an AVI file that is on the trail camera's SD card, 
## splits the audio and the video using `gpac`, and then remuxes them
## properly using `ffmpeg`. The resulting mp4 file is safe for use in
## Apple Photos. However, at this stage, we still have no metadata, 
## because neither the JPG files nor the AVI files have any such data,
## at least, not that we can locate.
##
## This script should only be applied to transform AVI files. Anything
## else does not require this transform

## stat --format "%Y" '/home/stuart/Trail Cam/Trail cam 29th October 2025/DSCF0002.JPG'
## date --rfc-3339=seconds -u -d "@1756572020"

INROOT=$1
OUTROOT=$2

SCRIPT_DIR=$(dirname "$0")
echo "SCRIPT_DIR" $SCRIPT_DIR

## On a Mac, the simplest way to get the time from an image and/or video
## is to have an image and extract the text. This is guaranteed to be 
## correct, and not depending on whether or not the original file times
## were sound.

update_video_timestamps(){
  INFILE=$1
  OUTFILE=$2

  # extract the modification time, which seems correct, and reformat to UTC rfc-3339
  MTIME_UTC=`stat --format "%Y" "${INFILE}"`
  FORMATTED_MTIME_UTC=`date --rfc-3339=seconds -u -d "@${MTIME_UTC}"`

  TAG_MTIME_UTC_I1="${FORMATTED_MTIME_UTC//-/:}"
  TAG_MTIME_UTC="${TAG_MTIME_UTC_I1/%+00:00/:}"

  exiftool -overwrite_original -api QuickTimeUTC=1 -tagsFromFile "${INFILE}" \
    '-OffsetTimeOriginal=+00:00' \
    '-OffsetTimeDigitized=+00:00' \
    "-DateTimeOriginal=${TAG_MTIME_UTC}" \
    "-CreateDate=${TAG_MTIME_UTC}" \
    "-MediaCreateDate=${TAG_MTIME_UTC}" \
    "-TrackCreateDate=${TAG_MTIME_UTC}" \
    "-ModifyDate=${TAG_MTIME_UTC}" \
    "-MediaModifyDate=${TAG_MTIME_UTC}" \
    "-TrackModifyDate=${TAG_MTIME_UTC}" \
    "${OUTFILE}"
}

## Reads the timestamp from the image, which should be interpreted as local time
## although we may or may not handle daylight savings.

get_timestamp() {
  FILENAME=$1

  IMAGE_TEXT=`osascript $SCRIPT_DIR/get-image-text.applescript "$FILENAME"`
  echo "Image file data:" $IMAGE_TEXT

  DATE_REGEX='([0-3][0-9])/([0-1][0-9])/([2][0-9][0-9][0-9]) ([0-2][0-9]):([0-5][0-9]):([0-5][0-9])'

  if [[ $IMAGE_TEXT =~ $DATE_REGEX ]]; then
    echo "Date: ${BASH_REMATCH[1]}/${BASH_REMATCH[2]}/${BASH_REMATCH[3]}"
  else
    echo "No match"
  fi
}

update_image_timestamps(){
  INFILE=$1
  OUTFILE=$2

  # we really want to get text from the file
  # IMAGE_TEXT=`osascript $SCRIPT_DIR/get-image-text.applescript "$INFILE"`
  # echo "Image file data:" $IMAGE_TEXT

  get_timestamp "${INFILE}"

  # # extract the modification time, which seems correct, and reformat to UTC rfc-3339
  # MTIME_UTC=`stat --format "%Y" "${INFILE}"`
  # FORMATTED_MTIME_UTC=`date --rfc-3339=seconds -u -d "@${MTIME_UTC}"`

  # TAG_MTIME_UTC_I1="${FORMATTED_MTIME_UTC//-/:}"
  # TAG_MTIME_UTC="${TAG_MTIME_UTC_I1/%+00:00/:}"

  # exiftool -overwrite_original -api QuickTimeUTC=1 -tagsFromFile "${INFILE}" \
  #   '-OffsetTimeOriginal=+00:00' \
  #   '-OffsetTimeDigitized=+00:00' \
  #   "-DateTimeOriginal=${TAG_MTIME_UTC}" \
  #   "-CreateDate=${TAG_MTIME_UTC}" \
  #   "-MediaCreateDate=${TAG_MTIME_UTC}" \
  #   "-TrackCreateDate=${TAG_MTIME_UTC}" \
  #   "-ModifyDate=${TAG_MTIME_UTC}" \
  #   "-MediaModifyDate=${TAG_MTIME_UTC}" \
  #   "-TrackModifyDate=${TAG_MTIME_UTC}" \
  #   "${OUTFILE}"
}

recode_file(){
  FILENAME=$1

  ## Make sure the output directory exists

  echo "INROOT" $INROOT
  INFILE="${FILENAME#$INROOT/}"
  echo "FILENAME" $FILENAME
  echo "INFILE" $INFILE

  INFILE_EXT="${INFILE##*.}"
  INFILE_TYPE=`file -b --mime-type "$INROOT/${INFILE}"`

  echo "INFILE_TYPE" $INFILE_TYPE

  ## JPEG files, copy across directly
  if [[ "${INFILE_TYPE}" == "image/jpeg" ]]; then
    OUTFILE="${OUTROOT}/${INFILE}"
    OUTDIR="$(dirname "$OUTFILE")"
    mkdir -p "${OUTDIR}"
    echo "Copying: $INROOT/${INFILE} to ${OUTFILE}"
    cp "$INROOT/${INFILE}" "${OUTFILE}"
    update_image_timestamps "$INROOT/${INFILE}" "${OUTFILE}"
    return
  fi

  return

  ## AVI files, extract the audio and video and re-multiplex
  if [[ "${INFILE_TYPE}" == "video/x-msvideo" ]]; then
    return
    OUTFILE="${OUTROOT}/${FILENAME%.*}.MP4"
    OUTDIR="$(dirname "$OUTFILE")"

    echo "Re-muxing video: ${INFILE} to ${OUTFILE}"

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
    rm "${OUTFILE}.pcm" 
    rm "${OUTFILE}.h264"
    update_video_timestamps "${INFILE}" "${OUTFILE}"
    return
  fi
}

export -f get_timestamp
export -f recode_file
export -f update_video_timestamps
export -f update_image_timestamps
export SCRIPT_DIR
export INROOT
export OUTROOT

find "$INROOT" -type f -print0 | sort -z | xargs -0 -I{} bash -c 'recode_file "{}"' 
