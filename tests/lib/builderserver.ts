import { sh, type Result } from './shell';
import { builderImage, builderLabels } from './builderimage';

/**
 * The shipped build server, running as PID 1 in a throwaway builder container,
 * with `/opt/builder/build.sh` replaced by a stub.
 *
 * **PID 1 is the point.** In compose the server is the container's init, and it
 * reaps nothing it did not start, so whatever a build leaves orphaned ends as a
 * zombie under it. A server started in the background of a shell inherits that
 * shell as init instead, which reaps, and a case about zombies would pass there
 * for the wrong reason.
 *
 * The real `build.sh` stays at `/opt/builder/build.real.sh`, so a stub can take
 * the shipped `work_dir_for_build` out of it. `pre` runs as root before the
 * server starts -- what a previous run might have left. Labelled, so the builder
 * sweep reclaims it after a killed run.
 */
export type BuilderServer = {
  exec: (script: string) => Result;
  build: (source: string) => Result;
  stop: () => void;
};

const PORT = 8779;

export function startBuilderServer(opts: { stub: string; pre?: string; dockerArgs?: string[] }): BuilderServer {
  const boot = [
    'set -e',
    'cp /opt/builder/build.sh /opt/builder/build.real.sh',
    `cat > /opt/builder/build.sh <<'STUB'\n${opts.stub}\nSTUB`,
    'chmod 755 /opt/builder/build.sh',
    opts.pre ?? ':',
    `export NAR_BUILDER_PORT=${PORT}`,
    'exec java /opt/builder/BuildServer.java'
  ].join('\n');
  const run = sh([
    'docker', 'run', '-d', ...builderLabels(), ...(opts.dockerArgs ?? []),
    '--entrypoint', 'sh', builderImage(), '-c', boot
  ]);
  if (run.code !== 0) throw new Error(`the builder server could not be started:\n${run.output}`);
  const id = run.stdout.trim();
  const exec = (script: string) => sh(['docker', 'exec', id, 'sh', '-c', script]);
  const up = exec(
    `for i in $(seq 1 240); do curl -fsS http://127.0.0.1:${PORT}/health >/dev/null 2>&1 && exit 0; sleep 0.25; done; exit 1`
  );
  if (up.code !== 0) {
    const logs = sh(['docker', 'logs', id]).output;
    sh(['docker', 'rm', '-f', id]);
    throw new Error(`the builder server never answered /health:\n${logs}`);
  }
  return {
    exec,
    build: (source: string) =>
      exec(
        `curl -s -w '\\nHTTP=%{http_code}\\n' -H 'X-Liquid-Agent: 1' -X POST --data-binary '${source}' http://127.0.0.1:${PORT}/build`
      ),
    stop: () => {
      sh(['docker', 'rm', '-f', id]);
    }
  };
}

/** The stub's preamble: the shipped work directory, made for the slot's user. */
export const STUB_PREAMBLE = [
  '#!/bin/sh',
  `eval "$(sed -n -E '/^BUILD_USER=/p; /^work_dir_for_build\\(\\) \\{/,/^}/p' /opt/builder/build.real.sh)"`,
  'W=$(work_dir_for_build)',
  'echo "BUILD-USER=$BUILD_USER"',
  'echo "WORK=$W"',
  'as_user() { su "$BUILD_USER" -s /bin/sh -c "$1"; }'
].join('\n');
