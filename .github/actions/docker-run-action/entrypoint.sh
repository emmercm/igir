#!/usr/bin/env bash

if [ -n "${INPUT_USERNAME}" ]; then
  echo "${INPUT_PASSWORD}" | docker login "${INPUT_REGISTRY}" -u "${INPUT_USERNAME}" --password-stdin
fi

if [ -n "${INPUT_DOCKER_NETWORK}" ]; then
  INPUT_OPTIONS="${INPUT_OPTIONS} --network ${INPUT_DOCKER_NETWORK}"
fi

# shellcheck disable=SC2086
exec docker run \
  --volume "/var/run/docker.sock":"/var/run/docker.sock" \
  --env INPUT_RUN \
  ${INPUT_OPTIONS} \
  "--entrypoint=${INPUT_SHELL}" \
  "${INPUT_IMAGE}" \
  -c 'echo "${INPUT_RUN}" > /run_file && chmod +x /run_file && /run_file'
