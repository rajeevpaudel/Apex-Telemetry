#!/usr/bin/env bash

set -euo pipefail

OUTPUT_DIR="/home/rajeev/workspace/f1-viz/reference track layout"
BASE_URL="https://media.formula1.com/image/upload/c_lfill,w_3392/q_auto/v1740000001/content/dam/fom-website/2018-redesign-assets/Circuit%20maps%2016x9"

# 2025 F1 calendar circuit names (as used in F1 media URLs)
CIRCUITS=(
  "Bahrain_Circuit"
  "Saudi_Arabia_Circuit"
  "Australia_Circuit"
  "Japan_Circuit"
  "China_Circuit"
  "Miami_Circuit"
  "Emilia_Romagna_Circuit"
  "Monaco_Circuit"
  "Canada_Circuit"
  "Spain_Circuit"
  "Austria_Circuit"
  "Great_Britain_Circuit"
  "Hungary_Circuit"
  "Belgium_Circuit"
  "Netherlands_Circuit"
  "Italy_Circuit"
  "Azerbaijan_Circuit"
  "Singapore_Circuit"
  "United_States_Circuit"
  "Mexico_City_Circuit"
  "Brazil_Circuit"
  "Las_Vegas_Circuit"
  "Qatar_Circuit"
  "Abu_Dhabi_Circuit"
)

mkdir -p "$OUTPUT_DIR"

echo "Downloading F1 circuit map images..."
echo ""

SUCCESS=0
FAILED=0

for CIRCUIT in "${CIRCUITS[@]}"; do
  ENCODED="${CIRCUIT// /%20}"
  URL="${BASE_URL}/${ENCODED}.webp"
  OUTFILE="${OUTPUT_DIR}/${CIRCUIT}.webp"

  if [[ -f "$OUTFILE" ]]; then
    echo "  SKIP  ${CIRCUIT} (already exists)"
    SUCCESS=$((SUCCESS + 1))
    continue
  fi

  HTTP_CODE=$(curl -s -o "$OUTFILE" -w "%{http_code}" \
    -L \
    -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" \
    "$URL")

  if [[ "$HTTP_CODE" == "200" ]]; then
    SIZE=$(du -h "$OUTFILE" | cut -f1)
    echo "  OK    ${CIRCUIT} (${SIZE})"
    SUCCESS=$((SUCCESS + 1))
  else
    rm -f "$OUTFILE"
    echo "  FAIL  ${CIRCUIT} (HTTP ${HTTP_CODE})"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "Done: ${SUCCESS} downloaded, ${FAILED} failed."
