#!/usr/bin/env bash

if [ -n "${INPUT_USERNAME}" ]; then
  echo "${INPUT_PASSWORD}" | docker login "${INPUT_REGISTRY}" -u "${INPUT_USERNAME}" --password-stdin
fi

if [ -n "${INPUT_DOCKER_NETWORK}" ]; then
  INPUT_OPTIONS="${INPUT_OPTIONS} --network ${INPUT_DOCKER_NETWORK}"
fi

ls -al "${GITHUB_STEP_SUMMARY}"
echo "${INPUT_RUN}" > run_file && chmod +x run_file
ls -al

# shellcheck disable=SC2086
exec docker run \
  --volume "/var/run/docker.sock:/var/run/docker.sock" \
  --volume "${GITHUB_ENV}:${GITHUB_ENV}" \
  --volume "${GITHUB_OUTPUT}:${GITHUB_OUTPUT}" \
  --volume "${GITHUB_STEP_SUMMARY}:${GITHUB_STEP_SUMMARY}" \
  --volume "$(pwd)/run_file:/run_file:ro" \
  --env GITHUB_ENV \
  --env GITHUB_OUTPUT \
  --env GITHUB_STEP_SUMMARY \
  --env INPUT_RUN \
  ${INPUT_OPTIONS} \
  "--entrypoint=${INPUT_SHELL}" \
  "${INPUT_IMAGE}" \
  -c "echo \$GITHUB_STEP_SUMMARY; ls -al /github/file_commands; ls -al \$GITHUB_STEP_SUMMARY; /run_file"
