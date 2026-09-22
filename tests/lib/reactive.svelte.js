// Compiled by the component tier's plugin, because `$state` is a rune and needs
// the compiler. Kept as its own file for exactly that reason: a .ts file cannot
// carry a rune, and the props object has to be a real state proxy -- see the
// note on reactiveProps in mount.ts.
export function makeReactive(initial) {
  const props = $state({ ...initial });
  return props;
}
