#!/usr/bin/env bash
# Cut screen recordings into frames Claude can read.
#
#   bash docs/whatsapp-gap/cut.sh                 # every clip in raw/whatsapp and raw/nod
#   bash docs/whatsapp-gap/cut.sh raw/whatsapp/03-voice-note.mp4
#   bash docs/whatsapp-gap/cut.sh --motion raw/whatsapp/01-hold-menu.mp4 2.0 2.8
#
# Default mode keeps a frame only when the screen has changed (at most 3 a second),
# stamps each with its time in the clip, and tiles them 5 x 2 into contact sheets.
# --motion keeps every frame between two times, to measure how long an animation takes.
#
# Output: frames/<whatsapp|nod>/<clip name>/  (f_001.jpg …, sheet_01.jpg …, info.txt)
# raw/ and frames/ are gitignored: recordings can show people's chats.

set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

# Windows ffmpeg needs the font path with an escaped drive colon.
font=""
for f in "C:/Windows/Fonts/arial.ttf" "/c/Windows/Fonts/arial.ttf" "/System/Library/Fonts/Supplemental/Arial.ttf" "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"; do
  if [ -f "$f" ]; then font="$f"; break; fi
done
font="${font/\/c\//C:/}"
font_arg=""
[ -n "$font" ] && font_arg="fontfile='${font/:/\\:}':"
stamp="drawtext=${font_arg}text='%{pts\\:hms}':x=12:y=h-th-12:fontsize=h/28:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=8"
# Portrait phone recordings tile at 300 px wide; landscape ones at 640.
size="scale='if(gt(ih,iw),300,640)':-2"

out_dir() {
  local clip="$1" source name
  source="$(basename "$(dirname "$clip")")"
  name="$(basename "${clip%.*}")"
  echo "frames/$source/$name"
}

cut_changes() {
  local clip="$1" out
  out="$(out_dir "$clip")"
  rm -rf "$out"; mkdir -p "$out"
  ffmpeg -hide_banner -loglevel info -i "$clip" \
    -vf "fps=3,mpdecimate=hi=64*24:lo=64*8:frac=0.2,$stamp,$size,showinfo" \
    -fps_mode vfr -q:v 3 "$out/f_%03d.jpg" 2> "$out/ffmpeg.log"
  local count
  count=$(ls "$out"/f_*.jpg 2>/dev/null | wc -l)
  ffmpeg -hide_banner -loglevel error -framerate 1 -i "$out/f_%03d.jpg" \
    -vf "tile=5x2:padding=6:margin=6:color=white" -q:v 3 "$out/sheet_%02d.jpg"
  {
    echo "clip: $clip"
    ffprobe -v error -show_entries stream=width,height,r_frame_rate:format=duration -of default=nw=1 "$clip" | grep -v '^$'
    echo "frames kept: $count"
    echo "frame times (s):"
    grep -o 'pts_time:[0-9.]*' "$out/ffmpeg.log" | cut -d: -f2 | nl -w3 -s'  '
  } > "$out/info.txt"
  rm -f "$out/ffmpeg.log"
  echo "$out  ($count frames, $(ls "$out"/sheet_*.jpg | wc -l) sheets)"
}

cut_motion() {
  local clip="$1" from="$2" to="$3" out
  out="$(out_dir "$clip")/motion_${from}-${to}"
  rm -rf "$out"; mkdir -p "$out"
  ffmpeg -hide_banner -loglevel error -ss "$from" -to "$to" -i "$clip" -copyts \
    -vf "$stamp,$size" -fps_mode passthrough -q:v 3 "$out/m_%03d.jpg"
  ffmpeg -hide_banner -loglevel error -framerate 1 -i "$out/m_%03d.jpg" \
    -vf "tile=6x2:padding=6:margin=6:color=white" -q:v 3 "$out/strip_%02d.jpg"
  echo "$out  ($(ls "$out"/m_*.jpg | wc -l) frames)"
}

if [ "${1:-}" = "--motion" ]; then
  [ $# -eq 4 ] || { echo "usage: cut.sh --motion <clip> <from s> <to s>"; exit 1; }
  cut_motion "$2" "$3" "$4"
  exit 0
fi

clips=("$@")
if [ ${#clips[@]} -eq 0 ]; then
  shopt -s nullglob nocaseglob
  clips=(raw/whatsapp/*.{mp4,mov} raw/nod/*.{mp4,mov,webm})
fi
[ ${#clips[@]} -gt 0 ] || { echo "No clips in raw/whatsapp or raw/nod yet."; exit 0; }
for c in "${clips[@]}"; do cut_changes "$c"; done
