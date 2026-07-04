#!/usr/bin/env bash
# @param {string} $1 Wii .dol file
# @param {string=} $2 New .iso name, defaults to the name of the .dol file
# @param {string=} $3 New .iso ID6, defaults to "RXXA99"
# Requires https://wit.wiimm.de/wit/
set -euxo pipefail

# shellcheck disable=SC2064
trap "cd \"${PWD}\"" EXIT
cd "$(dirname "$0")"

input_iso_file=iso_template.iso
bzip2 -dkc iso_template.iso.bz2 > "${input_iso_file}"
input_dol_file=$1
output_iso_name=${2:-${input_dol_file%.[dD][oO][lL]}}
output_iso_id6=${3:-RXXA99}

id6="$(./wit id6 "${input_iso_file}")"
rm -rf "${id6}"
./wit extract --overwrite --psel data "${input_iso_file}" "${id6}"
find "${id6}" ! -name apploader.img ! -name bi2.bin ! -name boot.bin -delete || true

if [[ ! -d "${id6}/files" ]]; then
  mkdir "${id6}/files"
fi
cp "${input_dol_file}" "${id6}/sys/main.dol"
echo "part-offset = 0x50000" > "${id6}/setup.txt"

./wit copy --id "${output_iso_id6}" --name "${output_iso_name}" --iso --overwrite "${id6}" "${output_iso_name}.iso"

./wit copy --gcz --gcz-block 32K --overwrite "${output_iso_name}.iso" "${output_iso_name}.gcz"

./wit copy --wia --compression PURGE --overwrite "${output_iso_name}.iso" "${output_iso_name}.purge.wia"
./wit copy --wia --compression BZIP2.3@10 --overwrite "${output_iso_name}.iso" "${output_iso_name}.bzip2.wia"
./wit copy --wia --compression LZMA.5@20 --overwrite "${output_iso_name}.iso" "${output_iso_name}.lzma.wia"
./wit copy --wia --compression LZMA2.5@20 --overwrite "${output_iso_name}.iso" "${output_iso_name}.lzma2.wia"

./wit copy --wia --iso --trunc --overwrite "${output_iso_name}.iso" "${output_iso_name}.trunc.iso"
rm "${output_iso_name}.iso"

rm -rf "${id6}"
