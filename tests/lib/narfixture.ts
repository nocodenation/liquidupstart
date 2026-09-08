import { mkdirSync, writeFileSync, rmSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './paths';
import { sh, shAsync, type Result, type Timed } from './shell';

export const DROP_HOST = join(repoRoot, 'volumes/nar_extensions');
export const REPOS_HOST = join(repoRoot, 'volumes/repos');
export const CACHE_HOST = join(repoRoot, 'volumes/nar_builder/m2');

export const narCommand = join(repoRoot, 'config/agents/bin/nar-build.sh');
export const builderScript = join(repoRoot, 'config/nar_builder/build.sh');
export const builderServer = join(repoRoot, 'config/nar_builder/BuildServer.java');
export const NAR_MOUNT = '/usr/local/bin/nar-build';
export const BUILDER_SERVICE = 'nar_builder';

export const PROBE_PACKAGE = 'org.nocodenation.probe';
export const PROBE_CLASS = `${PROBE_PACKAGE}.ProbeProcessor`;
export const SPI_DESCRIPTOR = 'META-INF/services/org.apache.nifi.processor.Processor';

const PROBE_BODY = '    public void onTrigger(ProcessContext context, ProcessSession session) { }';
const BROKEN_BODY =
  '    public void onTrigger(ProcessContext context, ProcessSession session) { int probe = "probe"; }';

export const PROBE_SIMPLE_NAME = 'ProbeProcessor';

function probeSource(body: string, simpleName: string = PROBE_SIMPLE_NAME): string {
  return `package ${PROBE_PACKAGE};

import org.apache.nifi.processor.AbstractProcessor;
import org.apache.nifi.processor.ProcessContext;
import org.apache.nifi.processor.ProcessSession;

public class ${simpleName} extends AbstractProcessor {
    @Override
${body}
}
`;
}

export const PROBE_SOURCE = probeSource(PROBE_BODY);
export const BROKEN_SOURCE = probeSource(BROKEN_BODY);

export const OWN_POM_ARTIFACT = 'probe-with-pom';
export const OWN_POM_DEPENDENCY = 'commons-lang3';

export function ownPom(nifiVersion: string, javaMajor: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>org.nocodenation.probe</groupId>
  <artifactId>${OWN_POM_ARTIFACT}</artifactId>
  <version>1.0.0</version>
  <packaging>nar</packaging>
  <properties>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <maven.compiler.release>${javaMajor}</maven.compiler.release>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.apache.nifi</groupId>
      <artifactId>nifi-api</artifactId>
      <version>${nifiVersion}</version>
      <scope>provided</scope>
    </dependency>
    <dependency>
      <groupId>org.apache.commons</groupId>
      <artifactId>${OWN_POM_DEPENDENCY}</artifactId>
      <version>3.17.0</version>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.nifi</groupId>
        <artifactId>nifi-nar-maven-plugin</artifactId>
        <version>2.4.0</version>
        <extensions>true</extensions>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

export type Fixture = {
  host: string;
  container: string;
  name: string;
  processor: string;
  artifact: string;
};

export function seedSource(
  name: string,
  opts: { broken?: boolean; pom?: string; className?: string } = {}
): Fixture {
  const simpleName = opts.className ?? PROBE_SIMPLE_NAME;
  const host = join(REPOS_HOST, name);
  rmSync(host, { recursive: true, force: true });
  const javaDir = join(host, 'src/main/java', ...PROBE_PACKAGE.split('.'));
  const resDir = join(host, 'src/main/resources/META-INF/services');
  mkdirSync(javaDir, { recursive: true });
  mkdirSync(resDir, { recursive: true });
  writeFileSync(
    join(javaDir, `${simpleName}.java`),
    probeSource(opts.broken ? BROKEN_BODY : PROBE_BODY, simpleName)
  );
  const processor = `${PROBE_PACKAGE}.${simpleName}`;
  writeFileSync(join(resDir, 'org.apache.nifi.processor.Processor'), `${processor}\n`);
  if (opts.pom) writeFileSync(join(host, 'pom.xml'), opts.pom);
  return { host, container: `/repos/${name}`, name, processor, artifact: artifactName(name) };
}

// build.sh derives the artifact name from the source directory alone, so a case
// can name the file it expects without parsing the build's output for it.
export function artifactName(dir: string): string {
  const art = dir
    .split('/')
    .pop()!
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/[.-]+$/, '');
  return `${art || 'liquid-processor'}-nar-1.0.0.nar`;
}

export function dropFixture(fx: Fixture): void {
  rmSync(fx.host, { recursive: true, force: true });
}

function narBuildArgv(
  service: string,
  arg: string,
  env: Record<string, string>,
  extraArgs: string[]
): string[] {
  const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  return [
    'docker',
    'compose',
    'exec',
    '-T',
    ...envArgs,
    service,
    'nar-build',
    ...extraArgs,
    ...(arg ? [arg] : [])
  ];
}

export function narBuild(
  service: string,
  arg: string,
  env: Record<string, string> = {},
  extraArgs: string[] = []
): Result {
  return sh(narBuildArgv(service, arg, env, extraArgs));
}

// The same invocation, started rather than waited for, so two builds can be in
// flight at once. It carries the child's exit status, both its streams and the
// wall clock either side of it -- everything a concurrency case needs to say
// what happened rather than only that something did.
export function narBuildAsync(
  service: string,
  arg: string,
  env: Record<string, string> = {},
  extraArgs: string[] = []
): Promise<Timed> {
  return shAsync(narBuildArgv(service, arg, env, extraArgs));
}

// What the builder is running right now, read from /proc inside the container.
// BuildServer serves on a fixed pool of two, so two requests fit and a third
// queues: a pair that happened to serialise would still both succeed, and a case
// checking only exit status would be measuring the queue instead of the
// collision. Sampling this while the builds run is how a case establishes that
// they were genuinely concurrent.
//
// Only the build.sh processes the BuildServer itself started are counted. This is
// not fastidiousness: build.sh calls resolve_target through $(...), and the
// sub-shell inherits its parent's cmdline verbatim, so one build shows up as two
// entries for part of its run. Counting entries would make a single build
// indistinguishable from an overlapping pair, which is precisely the thing the
// sample exists to tell apart. Parentage says which is which.
export type BuildProcess = { pid: string; source: string };

const SERVER_CMD = '/opt/builder/BuildServer.java';

export async function buildsInFlight(): Promise<BuildProcess[]> {
  const r = await shAsync([
    'docker',
    'compose',
    'exec',
    '-T',
    BUILDER_SERVICE,
    'sh',
    '-c',
    'for d in /proc/[0-9]*; do ' +
      'c=$(tr "\\0" " " < "$d/cmdline" 2>/dev/null); ' +
      '[ -n "$c" ] || continue; ' +
      'p=$(sed -n "s/^PPid:[[:space:]]*//p" "$d/status" 2>/dev/null); ' +
      'echo "${d#/proc/} ${p} ${c}"; done'
  ]);
  const rows = r.stdout.split('\n').map((line) => {
    const m = line.match(/^(\d+) (\d+) (.*)$/);
    return m ? { pid: m[1], ppid: m[2], cmd: m[3] } : null;
  });
  const server = rows.find((row) => row !== null && row.cmd.includes(SERVER_CMD));
  if (!server) return [];
  return rows
    .filter((row) => row !== null && row.ppid === server.pid)
    .map((row) => ({ row: row!, m: row!.cmd.match(/\/opt\/builder\/build\.sh build (\S+)/) }))
    .filter(({ m }) => m !== null)
    .map(({ row, m }) => ({ pid: row.pid, source: m![1] }));
}

export type Observation = { samples: BuildProcess[][]; concurrent: BuildProcess[][] };

export function observeBuilds(intervalMs = 150): { stop: () => Promise<Observation> } {
  let running = true;
  const samples: BuildProcess[][] = [];
  const loop = (async () => {
    while (running) {
      samples.push(await buildsInFlight());
      await Bun.sleep(intervalMs);
    }
  })();
  return {
    stop: async () => {
      running = false;
      await loop;
      return { samples, concurrent: samples.filter((s) => s.length > 1) };
    }
  };
}

export function target(service = 'opencode', env: Record<string, string> = {}): Result {
  return narBuild(service, '', env, ['--target']);
}

export function targetField(output: string, key: string): string {
  const m = output.match(new RegExp(`^${key}\\s+(.+)$`, 'm'));
  return m ? m[1].trim() : '';
}

export function dropContents(): string[] {
  if (!existsSync(DROP_HOST)) return [];
  return readdirSync(DROP_HOST).sort();
}

export function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function clearDrop(): void {
  for (const f of dropContents()) rmSync(join(DROP_HOST, f), { recursive: true, force: true });
}

// Opening the archive, not counting the files beside it. A NAR half-written by a
// concurrent build lists nothing and fails the CRC check its central directory
// carries; the entrypoint would copy it into lib/ regardless.
export function narIntegrity(nar: string): Result {
  return sh(['unzip', '-t', nar]);
}

export function narEntries(nar: string): string[] {
  const r = sh(['unzip', '-Z1', nar]);
  return r.code === 0 ? r.stdout.trim().split('\n') : [];
}

export function spiDescriptorInNar(nar: string): string {
  const work = join(repoRoot, 'volumes/nar_builder/.inspect');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  try {
    if (sh(['unzip', '-q', '-o', nar, '-d', work]).code !== 0) return '';
    const bundled = ['NAR-INF/bundled-dependencies', 'META-INF/bundled-dependencies']
      .map((d) => join(work, d))
      .find((d) => existsSync(d));
    const jars = bundled ? readdirSync(bundled).filter((f) => f.endsWith('.jar')) : [];
    const direct = join(work, SPI_DESCRIPTOR);
    if (existsSync(direct)) return readFileSync(direct, 'utf8');
    for (const jar of jars) {
      const r = sh(['unzip', '-p', join(bundled as string, jar), SPI_DESCRIPTOR]);
      if (r.code === 0 && r.stdout.trim().length > 0) return r.stdout;
    }
    return '';
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export function cacheIsPopulated(): boolean {
  const api = join(CACHE_HOST, 'org/apache/nifi/nifi-api');
  return existsSync(api) && statSync(api).isDirectory() && readdirSync(api).length > 0;
}

export function builderCredentialScan(): Result {
  return sh([
    'docker',
    'compose',
    'exec',
    '-T',
    BUILDER_SERVICE,
    'sh',
    '-lc',
    'echo "PATHS:"; ls -d /git-secrets 2>/dev/null; ' +
      'find / -xdev \\( -name "id_ed25519" -o -name "id_rsa" -o -name "known_hosts" \\) ' +
      '-not -path "/proc/*" 2>/dev/null; ' +
      'echo "KEYNAMES:"; env | grep -Ei "KEY|SECRET|PASSWORD|TOKEN" | cut -d= -f1; ' +
      'echo "END"'
  ]);
}

export const API_PROBE_LEVER = 'NAR_BUILD_API_PROBE_VERSION';
export const UNRESOLVABLE_VERSION = '99.99.99';

export function resolveApiThroughNifiUtils(nifiVersion: string): Result {
  const script = `W=$(mktemp -d); cd "$W"
cat > pom.xml <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>org.nocodenation.probe</groupId>
  <artifactId>nifi-api-probe</artifactId>
  <version>1.0.0</version>
  <packaging>pom</packaging>
  <dependencies>
    <dependency>
      <groupId>org.apache.nifi</groupId>
      <artifactId>nifi-utils</artifactId>
      <version>NIFI_VERSION</version>
    </dependency>
  </dependencies>
</project>
EOF
sed -i "s|NIFI_VERSION|${nifiVersion}|" pom.xml
mvn -B -f pom.xml -Dmaven.repo.local=/m2 dependency:list 2>&1 | sed -n 's/.*org\\.apache\\.nifi:nifi-api:jar:\\([0-9][^:]*\\):.*/RESOLVED \\1/p' | head -1
rm -rf "$W"`;
  return sh(['docker', 'compose', 'exec', '-T', BUILDER_SERVICE, 'sh', '-lc', script]);
}

export function resolvedApi(nifiVersion: string): string {
  const r = resolveApiThroughNifiUtils(nifiVersion);
  const m = r.stdout.match(/^RESOLVED\s+(\S+)$/m);
  return m ? m[1] : '';
}
