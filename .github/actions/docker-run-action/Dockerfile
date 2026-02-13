FROM docker:29

RUN apk add bash

COPY .github/actions/docker-run-action/entrypoint.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
