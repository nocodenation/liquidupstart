// Whether a run of B6-35's watcher leg may be read, decided over its output.
//
// #29. The leg's `&` and `\&` scenarios can only fail in a shell where an unquoted
// `&` in a replacement is the matched text: bash 5.2 or later with
// `patsub_replacement` on. In `bash:5.1` they were measured green on the N5
// defect, and a run that never started (exit 125, an image that is not there)
// read as `Received: ""`. So the run prints `CANARY=` from `${c//X/&&}` with
// `c=X`, in the same `bash -c` that then evaluates the shipped line, and this
// reads it. A pure function, like `movedMessage` in `liquidimage.ts`, because a
// decision that only runs inside a container is one nobody measures (B6-40).
// Specified as B6-47.

export const INCAPABLE = 'cannot show the & defect (needs bash >= 5.2 with patsub_replacement on)';

/** `null` for a run that may be read; otherwise the message `run()` throws. */
export function watcherRunVerdict(code: number, stdout: string, stderr: string): string | null {
  // The exit first: a run that did not start says nothing about its shell, even
  // beside a canary that looks right.
  if (code !== 0) return `watcher run exited ${code}: ${stderr}`;
  const canary = stdout.match(/^CANARY=(.*)$/m);
  if (canary && canary[1] === 'XX') return null;
  const bash = stdout.match(/^BASH=.*$/m);
  return `${INCAPABLE}: read ${bash ? bash[0] : 'no BASH= line'}, ${canary ? canary[0] : 'no CANARY= line'}`;
}
