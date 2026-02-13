#!/usr/bin/env bash

if [ -n "${INPUT_USERNAME}" ]; then
  echo "${INPUT_PASSWORD}" | docker login "${INPUT_REGISTRY}" -u "${INPUT_USERNAME}" --password-stdin
fi

if [ -n "${INPUT_DOCKER_NETWORK}" ]; then
  INPUT_OPTIONS="${INPUT_OPTIONS} --network ${INPUT_DOCKER_NETWORK}"
fi

touch "${GITHUB_ENV}"
touch "${GITHUB_OUTPUT}"
touch "${GITHUB_STEP_SUMMARY}"
echo "${INPUT_RUN}" > run_file && chmod +x run_file

# shellcheck disable=SC2086
exec docker run \
  --mount "type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock" \
  --mount "type=bind,source=/home/runner/work/_temp/_github_home,target=/github/home" \
  --mount "type=bind,source=/home/runner/work/_temp/_github_workflow,target=/github/workflow" \
  --mount "type=bind,source=/home/runner/work/_temp/_runner_file_commands,target=/github/file_commands" \
  --mount "type=bind,source=$(pwd)/run_file,target=/run_file,readonly" \
  --env GITHUB_ENV \
  --env GITHUB_OUTPUT \
  --env GITHUB_STEP_SUMMARY \
  ${INPUT_OPTIONS} \
  "--entrypoint=${INPUT_SHELL}" \
  "${INPUT_IMAGE}" \
  -c "echo \$GITHUB_STEP_SUMMARY; ls -al /github/file_commands; ls -al \$GITHUB_STEP_SUMMARY; /run_file"
