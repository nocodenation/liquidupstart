import { mkdirSync, writeFileSync, rmSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './paths';
import { sh, type Result } from './shell';

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

function probeSource(body: string): string {
  return `package ${PROBE_PACKAGE};

import org.apache.nifi.processor.AbstractProcessor;
import org.apache.nifi.processor.ProcessContext;
import org.apache.nifi.processor.ProcessSession;

public class ProbeProcessor extends AbstractProcessor {
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

export type Fixture = { host: string; container: string; name: string };

export function seedSource(
  name: string,
  opts: { broken?: boolean; pom?: string } = {}
): Fixture {
  const host = join(REPOS_HOST, name);
  rmSync(host, { recursive: true, force: true });
  const javaDir = join(host, 'src/main/java', ...PROBE_PACKAGE.split('.'));
  const resDir = join(host, 'src/main/resources/META-INF/services');
  mkdirSync(javaDir, { recursive: true });
  mkdirSync(resDir, { recursive: true });
  writeFileSync(
    join(javaDir, 'ProbeProcessor.java'),
    opts.broken ? BROKEN_SOURCE : PROBE_SOURCE
  );
  writeFileSync(join(resDir, 'org.apache.nifi.processor.Processor'), `${PROBE_CLASS}\n`);
  if (opts.pom) writeFileSync(join(host, 'pom.xml'), opts.pom);
  return { host, container: `/repos/${name}`, name };
}

export function dropFixture(fx: Fixture): void {
  rmSync(fx.host, { recursive: true, force: true });
}

export function narBuild(
  service: string,
  arg: string,
  env: Record<string, string> = {},
  extraArgs: string[] = []
): Result {
  const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  return sh([
    'docker',
    'compose',
    'exec',
    '-T',
    ...envArgs,
    service,
    'nar-build',
    ...extraArgs,
    ...(arg ? [arg] : [])
  ]);
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
