/**
 * Mounting a Svelte component, for the cases that cannot be held any other way.
 *
 * Until 2026-09-21 nothing in this repository mounted a component: `tests/component/`
 * exercises load functions and served page data, which is one layer short of the
 * markup. Three findings of that day's review lived in that layer -- a panel that
 * came back for three seconds, a label that counted wrong, a result line that
 * outlived the card it described -- and a text assertion over the source can only
 * say that the source says so.
 *
 * Two things this file exists to get right.
 *
 * **One `svelte`, for everything in the reactive graph.** The spike that measured
 * this tier was green over a component that had never re-rendered: the state module
 * sat outside `dashboard/`, resolved to a second copy of svelte, and the two kept
 * separate signal registries -- updates written in one universe, read in the other.
 * Every bare `svelte` specifier in compiled output is therefore rewritten to an
 * absolute path under `dashboard/node_modules`, so location cannot decide it.
 *
 * **Registration before import.** A static `import x from './x.svelte'` is resolved
 * before any statement of this module runs, so a component is reached through
 * `load()` below rather than imported directly.
 */
import { plugin } from 'bun';
import { join } from 'node:path';
import { repoRoot } from './paths';

const DASHBOARD = join(repoRoot, 'dashboard');
const SVELTE = join(DASHBOARD, 'node_modules', 'svelte');

// Resolved from the dashboard, which is where the one install lives, and burned
// into the compiled output as an absolute path.
const pin = (code: string) =>
  code.replace(/from\s+["'](svelte(?:\/[^"']+)?)["']/g, (_m, spec: string) => {
    try {
      return `from ${JSON.stringify(Bun.resolveSync(spec, DASHBOARD))}`;
    } catch {
      return _m;
    }
  });

let registered = false;

export async function setupComponentTier(): Promise<void> {
  if (registered) return;
  registered = true;

  const { GlobalRegistrator } = await import(
    join(DASHBOARD, 'node_modules', '@happy-dom', 'global-registrator', 'lib', 'index.js')
  );
  // `bun test` runs every file in one process, so these globals outlive this
  // tier and reach cases that have nothing to do with it. Registering the DOM
  // also replaces the network globals with the browser's, and the browser's
  // `fetch` enforces the Same-Origin Policy -- which broke M-A8's served-card
  // cases, whose whole point is fetching a page over HTTP from a dashboard
  // container they start themselves. `Cross-Origin Request Blocked`, in a file
  // that had not changed, on a suite run where the only difference was that a
  // component case had run first.
  //
  // What this tier needs is a document, not a browser network stack. So the
  // network globals are put back exactly as they were, and a case that wants a
  // stubbed `fetch` stubs it itself.
  // Everything a request or a response is made of, not only `fetch`: a
  // `FormData` from one implementation inside a `Request` from the other fails
  // to decode, which is how five config-view cases died with
  // `ERR_FORMDATA_PARSE_ERROR` in a file nobody had touched.
  const KEPT = [
    'fetch',
    'Request',
    'Response',
    'Headers',
    'FormData',
    'Blob',
    'File',
    'URLSearchParams',
    'AbortController',
    'AbortSignal',
    'ReadableStream'
  ] as const;
  const kept = Object.fromEntries(KEPT.map((k) => [k, (globalThis as any)[k]]));
  GlobalRegistrator.register();
  Object.assign(globalThis, kept);

  const { compile, compileModule } = await import(join(SVELTE, 'compiler', 'index.js'));

  plugin({
    name: 'svelte-components',
    setup(build) {
      // `$lib` is Vite's alias, which bun knows nothing about. Resolved to the
      // real directory rather than stubbed: a component's own state module is
      // part of what a case is testing.
      build.onResolve({ filter: /^\$lib\// }, (args) => ({
        path: join(DASHBOARD, 'src', 'lib', args.path.slice('$lib/'.length))
      }));
      build.onLoad({ filter: /\.svelte$/ }, async (args) => {
        const source = await Bun.file(args.path).text();
        const { js } = compile(source, { generate: 'client', filename: args.path, dev: false });
        return { contents: pin(js.code), loader: 'js' };
      });
      build.onLoad({ filter: /\.svelte\.js$/ }, async (args) => {
        const source = await Bun.file(args.path).text();
        const { js } = compileModule(source, { generate: 'client', filename: args.path });
        return { contents: pin(js.code), loader: 'js' };
      });
      // What the app gets from SvelteKit at runtime. `invalidateAll` is counted
      // rather than stubbed silently: a case that asserts the page is re-read
      // has to be able to say so.
      build.module('$app/navigation', () => ({
        exports: {
          invalidateAll: async () => {
            invalidations += 1;
          },
          goto: async () => {}
        },
        loader: 'object'
      }));
    }
  });
}

let invalidations = 0;
export const invalidationCount = () => invalidations;

export type Mounted = {
  target: HTMLElement;
  text: () => string;
  html: () => string;
  find: (label: string) => HTMLElement | undefined;
  click: (label: string) => void;
  settle: () => Promise<void>;
  unmount: () => void;
};

/**
 * Mounts a component and hands back the DOM plus the small set of things a case
 * needs to do to it. `props` must be the object a case keeps: assigning to its
 * properties is what a page-data change looks like from the component's side.
 */
export async function mountComponent(file: string, props: Record<string, unknown>): Promise<Mounted> {
  await setupComponentTier();
  const svelte: any = await import(join(SVELTE, 'src', 'index-client.js'));
  const module: any = await import(file);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = svelte.mount(module.default, { target, props });
  svelte.flushSync();

  const buttons = () => [...target.querySelectorAll('button')] as HTMLButtonElement[];
  return {
    target,
    text: () => target.textContent ?? '',
    html: () => target.innerHTML,
    find: (label) => buttons().find((b) => (b.textContent ?? '').includes(label)),
    click: (label) => {
      const button = buttons().find((b) => (b.textContent ?? '').includes(label));
      if (!button) throw new Error(`no button labelled ${JSON.stringify(label)} is drawn`);
      button.click();
    },
    settle: async () => {
      await Bun.sleep(20);
      svelte.flushSync();
    },
    unmount: () => {
      svelte.unmount(app);
      target.remove();
    }
  };
}

/**
 * A props object whose properties are reactive, which is the only shape a
 * mounted component reads more than once. An ordinary object -- or one with
 * accessors over a `$state` variable -- is read at mount and never again, and a
 * case built on one passes over a component that never re-rendered. That is not
 * hypothetical: it is what the first run of A16-16 did.
 */
export async function reactiveProps<T extends Record<string, unknown>>(initial: T): Promise<T> {
  await setupComponentTier();
  const { makeReactive } = await import(join(repoRoot, 'tests', 'lib', 'reactive.svelte.js'));
  return makeReactive(initial) as T;
}
