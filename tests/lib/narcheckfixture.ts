import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from './paths';
import { sh, type Result } from './shell';
import { DROP_HOST, REPOS_HOST, PROBE_PACKAGE } from './narfixture';

export const narcheckPath = join(repoRoot, 'config/liquid/narcheck.py');
export const BUILD_SERVICE = 'openclaw-gateway';
export const LIQUID_SERVICE = 'liquid';
export const CONTAINER_LIB = '/opt/nifi/nifi-current/lib';
export const CONTAINER_NARCHECK = '/opt/nifi/scripts/narcheck.py';
export const API_JAR_PREFIX = 'nifi-api-';
export const MISSING_CLASS = 'org/apache/nifi/controller/NodeConnectionState';
export const WEB_CLASS = 'org/apache/nifi/web/NiFiWebConfigurationContext';

export const PROBE_ALIVE_SOURCE = `package ${PROBE_PACKAGE};

import org.apache.nifi.processor.AbstractProcessor;
import org.apache.nifi.processor.ProcessContext;
import org.apache.nifi.processor.ProcessSession;

public class ProbeProcessor extends AbstractProcessor {
    @Override
    public void onTrigger(ProcessContext context, ProcessSession session) {
        getLogger().debug("probe alive");
    }
}
`;

export const LITERAL_SOURCE = `package ${PROBE_PACKAGE};

import org.apache.nifi.processor.AbstractProcessor;
import org.apache.nifi.processor.ProcessContext;
import org.apache.nifi.processor.ProcessSession;

public class LiteralProcessor extends AbstractProcessor {
    @Override
    public void onTrigger(ProcessContext context, ProcessSession session) {
        getLogger().debug("${MISSING_CLASS}");
    }
}
`;

export const MISMATCH_SOURCE = `package ${PROBE_PACKAGE};

import org.apache.nifi.controller.NodeConnectionState;
import org.apache.nifi.processor.AbstractProcessor;
import org.apache.nifi.processor.ProcessContext;
import org.apache.nifi.processor.ProcessSession;

public class MismatchProcessor extends AbstractProcessor {
    public NodeConnectionState state() {
        return NodeConnectionState.CONNECTED;
    }

    @Override
    public void onTrigger(ProcessContext context, ProcessSession session) {
        getLogger().debug("probe {}", new Object[] { state() });
    }
}
`;

export const WEB_SOURCE = `package ${PROBE_PACKAGE};

import org.apache.nifi.processor.AbstractProcessor;
import org.apache.nifi.processor.ProcessContext;
import org.apache.nifi.processor.ProcessSession;
import org.apache.nifi.web.NiFiWebConfigurationContext;

public class WebProcessor extends AbstractProcessor {
    @Override
    public void onTrigger(ProcessContext context, ProcessSession session) {
        getLogger().debug("probe {}", new Object[] { NiFiWebConfigurationContext.class });
    }
}
`;

export function pom(artifactId: string, apiVersion: string, extraDependencies = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>org.nocodenation.probe</groupId>
  <artifactId>${artifactId}</artifactId>
  <version>1.0.0</version>
  <packaging>nar</packaging>
  <properties>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <maven.compiler.release>21</maven.compiler.release>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.apache.nifi</groupId>
      <artifactId>nifi-api</artifactId>
      <version>${apiVersion}</version>
      <scope>provided</scope>
    </dependency>
${extraDependencies}  </dependencies>
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

export const FRAMEWORK_API_DEPENDENCY = `    <dependency>
      <groupId>org.apache.nifi</groupId>
      <artifactId>nifi-framework-api</artifactId>
      <version>2.11.0</version>
      <scope>provided</scope>
    </dependency>
`;

export type Built = { nar: string; artifact: string; build: Result };

// The source goes onto the host under volumes/repos, which every agent
// container mounts at /repos, and nar-build compiles it there. The artifact it
// writes into volumes/nar_extensions is moved out of that directory
// immediately: the drop directory is the operator's, and a suite that leaves
// NARs in it changes what Liquid loads on its next restart.
export function buildNar(
  dir: string,
  className: string,
  source: string,
  artifact: string,
  ownPom?: string
): Built {
  const host = join(REPOS_HOST, dir);
  rmSync(host, { recursive: true, force: true });
  const javaDir = join(host, 'src/main/java', ...PROBE_PACKAGE.split('.'));
  const resDir = join(host, 'src/main/resources/META-INF/services');
  mkdirSync(javaDir, { recursive: true });
  mkdirSync(resDir, { recursive: true });
  writeFileSync(join(javaDir, `${className}.java`), source);
  writeFileSync(join(resDir, 'org.apache.nifi.processor.Processor'), `${PROBE_PACKAGE}.${className}\n`);
  if (ownPom) writeFileSync(join(host, 'pom.xml'), ownPom);
  const build = sh(['docker', 'compose', 'exec', '-T', BUILD_SERVICE, 'nar-build', `/repos/${dir}`]);
  const produced = join(DROP_HOST, artifact);
  const kept = join(scratch(), artifact);
  if (existsSync(produced)) renameSync(produced, kept);
  rmSync(host, { recursive: true, force: true });
  return { nar: kept, artifact, build };
}

let scratchDir = '';
export function scratch(): string {
  if (!scratchDir) scratchDir = mkdtempSync(join(tmpdir(), 'm-b4-'));
  return scratchDir;
}

export function discardScratch(): void {
  if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
  scratchDir = '';
}

// The lib/ of the distribution that is running, not a description of it. The
// whole set of jars is taken, because what resolves a reference is whatever is
// there -- reading only nifi-api would make the check look stricter than it is.
export function stageLib(dest: string): Result {
  mkdirSync(dest, { recursive: true });
  const tar = join(dest, '..', 'lib.tar');
  const r = sh([
    'sh',
    '-c',
    `docker compose exec -T ${LIQUID_SERVICE} sh -c 'cd ${CONTAINER_LIB} && tar cf - *.jar' > ${tar} && tar xf ${tar} -C ${dest} && rm -f ${tar}`
  ]);
  return r;
}

export function stagedJars(dir: string): string[] {
  return readdirSync(dir).filter((n) => n.endsWith('.jar')).sort();
}

export function apiJar(dir: string): string {
  const found = stagedJars(dir).filter((n) => n.startsWith(API_JAR_PREFIX));
  if (found.length !== 1) throw new Error(`expected one ${API_JAR_PREFIX}*.jar in ${dir}, found ${found.length}`);
  return join(dir, found[0]);
}

export function jarEntries(jar: string): string[] {
  const r = sh(['unzip', '-Z1', jar]);
  return r.code === 0 ? r.stdout.trim().split('\n') : [];
}

export function jarsCarrying(dir: string, className: string): string[] {
  return stagedJars(dir).filter((n) => jarEntries(join(dir, n)).includes(`${className}.class`));
}

export function packagesOf(jar: string): Set<string> {
  const packages = new Set<string>();
  for (const entry of jarEntries(jar)) {
    if (!entry.endsWith('.class')) continue;
    const slash = entry.lastIndexOf('/');
    if (slash > 0) packages.add(entry.slice(0, slash));
  }
  return packages;
}

// The class out of the archive that carries it: the nar-maven-plugin puts the
// project's own classes into a jar under NAR-INF/bundled-dependencies, so a
// single unzip finds nothing.
export function classFromNar(nar: string, className: string, work: string): string {
  mkdirSync(work, { recursive: true });
  const entry = `${className}.class`;
  const direct = join(work, entry);
  if (sh(['unzip', '-o', '-q', nar, entry, '-d', work]).code === 0 && existsSync(direct)) return direct;
  for (const jar of jarEntries(nar).filter((n) => n.endsWith('.jar') && n.includes('bundled-dependencies/'))) {
    if (sh(['unzip', '-o', '-q', nar, jar, '-d', work]).code !== 0) continue;
    if (sh(['unzip', '-o', '-q', join(work, jar), entry, '-d', work]).code === 0 && existsSync(direct)) return direct;
  }
  throw new Error(`${entry} is not in ${nar}, neither at its root nor in a bundled jar`);
}

export function references(classFile: string): Result {
  return sh(['python3', narcheckPath, 'refs', classFile]);
}

export function referenceSet(classFile: string): string[] {
  const r = references(classFile);
  if (r.code !== 0) throw new Error(`narcheck refs failed on ${classFile}: ${r.output}`);
  return r.stdout.trim().split('\n').filter((l) => l.length > 0).sort();
}

export function guard(nar: string, libDir: string): Result {
  return sh(['python3', narcheckPath, 'check', nar, libDir]);
}

// A jar named as the API jar and carrying one entry, so that the packages the
// check is willing to judge can be moved without moving anything else.
export function fakeApiJar(dir: string, name: string, entries: string[]): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  const script = `import zipfile,sys
z = zipfile.ZipFile(sys.argv[1], "w")
for e in sys.argv[2:]:
    z.writestr(e, b"")
z.close()`;
  const r = sh(['python3', '-c', script, path, ...entries]);
  if (r.code !== 0) throw new Error(`could not write ${path}: ${r.output}`);
  return path;
}

export function narWithEntries(path: string, entries: Record<string, string>): string {
  const script = `import zipfile,sys
z = zipfile.ZipFile(sys.argv[1], "w")
for pair in sys.argv[2:]:
    name, _, body = pair.partition("=")
    z.writestr(name, body)
z.close()`;
  const args = Object.entries(entries).map(([k, v]) => `${k}=${v}`);
  const r = sh(['python3', '-c', script, path, ...args]);
  if (r.code !== 0) throw new Error(`could not write ${path}: ${r.output}`);
  return path;
}

// A failed build must say why here rather than leaving a case reporting
// "expected 0, received 1": the build runs in another container, and its output
// is the only record of what went wrong.
export function requireBuilt(...built: Built[]): void {
  for (const b of built) {
    if (b.build.code !== 0) {
      throw new Error(`nar-build did not produce ${b.artifact} (exit ${b.build.code}):\n${b.build.output}`);
    }
  }
}
