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

update_timestamps(){
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

recode_file(){
  INROOT=$1
  OUTROOT=$2
  FILENAME=$3

  ## Make sure the output directory exists

  INFILE="${INROOT}/${FILENAME}"

  INFILE_EXT="${INFILE##*.}"
  INFILE_TYPE=`file -b --mime-type "${INFILE}"`

  ## JPEG files, copy across directly
  if [[ "${INFILE_TYPE}" == "image/jpeg" ]]; then
    OUTFILE="${OUTROOT}/${FILENAME}"
    OUTDIR="$(dirname "$OUTFILE")"
    echo "Copying: ${INFILE} to ${OUTFILE}"
    cp "${INFILE}" "${OUTFILE}"
    update_timestamps "${INFILE}" "${OUTFILE}"
    return
  fi

  ## AVI files, extract the audio and video and re-multiplex
  if [[ "${INFILE_TYPE}" == "video/x-msvideo" ]]; then
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
    update_timestamps "${INFILE}" "${OUTFILE}"
    return
  fi
}

export -f recode_file
export -f update_timestamps
find "$INROOT" -type f -printf "%P\0" | sort -z | xargs -0 -I{} bash -c 'recode_file "$@"' recode_file "$INROOT" "$OUTROOT" "{}"
