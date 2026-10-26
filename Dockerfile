# syntax=docker/dockerfile:1.7
ARG REGISTRY=docker.io

FROM ${REGISTRY}/python:3.14.9-slim-trixie@sha256:35caba83af2fe6da9a5d922f9b0156f21d1246a48278c58a08bd253303ba42e8 AS python
FROM ${REGISTRY}/node:24.22.1-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea AS node

FROM ${REGISTRY}/buildpack-deps:trixie@sha256:880a5e3d451b50a7b1acd06093a980771a40c2fac2bce29a2145e0f4825266f4 AS base

COPY --from=python /usr/local/ /usr/local/
COPY --from=node /usr/local/ /usr/local/
COPY --from=node /opt/ /opt/

COPY requirements-runtime.txt /tmp/requirements-runtime.txt

# Add app user/group! Clean packages and fix links! Check version! And install some extra packages!
RUN set -ex \
    && apt-get update \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/* \
	&& groupadd -r app --gid=999 \
	&& useradd --system --create-home --home /app --gid 999 --uid=999 --shell /bin/bash app \
	&& rm -f /usr/local/bin/docker-entrypoint.sh \
	&& python --version \
	&& pip --version \
	&& node --version \
	&& yarn --version \
	&& python3 -m pip install --no-cache-dir --require-hashes -r /tmp/requirements-runtime.txt \
    && rm /tmp/requirements-runtime.txt \
    && echo "OK"

# Installer
FROM base AS installer

WORKDIR /app
# Copy pruned monorepo (only package.json + yarn.lock)
COPY --chown=app:app ./out /app
# Copy yarn berry
COPY --chown=app:app ./.yarn /app/.yarn
COPY --chown=app:app ./.yarnrc.yml /app/.yarnrc.yml
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --immutable --inline-builds

# Builder
FROM base as builder

ARG TURBO_TEAM
ARG TURBO_TOKEN
ARG TURBO_API
ARG TURBO_REMOTE_ONLY=false
# Homelab: narrow the monorepo build to the apps we actually deploy.
ARG BUILD_CMD="yarn build"

WORKDIR /app
# Copy entire repo
COPY --chown=app:app . /app
# Copy previously installed packages
COPY --from=installer --chown=app:app /app /app

ENV TURBO_TEAM=$TURBO_TEAM
ENV TURBO_TOKEN=$TURBO_TOKEN
ENV TURBO_API=$TURBO_API
ENV TURBO_REMOTE_ONLY=$TURBO_REMOTE_ONLY

RUN echo "# Build time .env config!" >> /app/.env && \
	echo "COOKIE_SECRET=undefined" >> /app/.env && \
	echo "DATABASE_URL=undefined" >> /app/.env && \
	echo "REDIS_URL=undefined" >> /app/.env && \
	echo "FILE_FIELD_ADAPTER=local" >> /app/.env && \
	echo "NEXT_TELEMETRY_DISABLED=1" >> /app/.env && \
	echo "NODE_ENV=production" >> /app/.env

RUN chmod +x ./bin/run_condo_domain_tests.sh

RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    --mount=type=cache,target=/app/.turbo \
    set -ex \
    && NODE_ENV=production node bin/security/ui-pragma-regression.cjs \
    && ${BUILD_CMD} \
    && rm -rf /app/out \
    && rm -rf /app/.env  \
    && rm -rf /app/.config /app/.cache /app/.docker  \
    && ls -lah /app/

# Keep development tools available for the build, then retain runtime workspaces.
RUN yarn workspaces focus @app/condo @app/address-service --production \
    && node bin/security/graphql-regression.cjs \
    && node bin/security/shell-quote-regression.cjs \
    && rm -f apps/condo/domains/notification/adapters/apple/AppleJSONWebToken.spec.js \
        apps/condo/domains/organization/integrations/sbbol/sync/MockSbbolResponses.js

# Runtime container: retain Python/Node libraries without compiler/header toolchains.
FROM python AS runtime
COPY --from=base /usr/local/ /usr/local/
COPY --from=node /opt/ /opt/
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates libstdc++6 libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r app --gid=999 \
    && useradd --system --create-home --home /app --gid 999 --uid=999 --shell /bin/bash app \
    && python3 -m pip check \
    && python3 -m pip uninstall -y pip setuptools wheel \
    && rm -rf /usr/local/lib/python3.14/ensurepip /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx \
    && node --version \
    && yarn --version
USER app:app
WORKDIR /app
COPY --from=builder --chown=app:app /app /app

# Fixtures are removed in the builder so their bytes never enter the final COPY layer.
RUN test ! -e apps/condo/domains/notification/adapters/apple/AppleJSONWebToken.spec.js \
    && test ! -e apps/condo/domains/organization/integrations/sbbol/sync/MockSbbolResponses.js \
    && node -e "for (const app of ['condo', 'address-service']) { const r = require('module').createRequire('/app/apps/' + app + '/package.json'); for (const name of ['@open-condo/clients/address-service-client', 'dd-trace', 'cross-env']) r.resolve(name); if (app === 'condo') for (const name of ['socks-proxy-agent', 'bad-words-next', 'typescript']) r.resolve(name); }"

RUN node bin/security/trust-roots.cjs

# Check the libraries actually loaded by Python, not only package metadata.
RUN python3 -c "import sqlite3, zlib, psycopg2; assert sqlite3.sqlite_version_info >= (3, 42, 0); assert tuple(map(int, zlib.ZLIB_RUNTIME_VERSION.split('.'))) >= (1, 3, 1); print('Runtime SQLite and zlib security version gates passed')"
