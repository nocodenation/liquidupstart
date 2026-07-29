export const task = $state({
  log: '',
  name: '',
  elapsed: 0,
  buildOk: false,
  startOk: false,
  failedTask: ''
});

export async function runTask(name, onchange) {
  if (task.name) return;
  task.name = name;
  task.log = '';
  task.failedTask = '';
  task.elapsed = 0;
  const t0 = Date.now();
  const ticker = setInterval(() => (task.elapsed = Math.floor((Date.now() - t0) / 1000)), 1000);
  try {
    const res = await fetch('/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: name })
    });
    if (!res.ok || !res.body) {
      task.log = `Could not start ${name}: ${res.status} ${await res.text()}\n`;
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      task.log += decoder.decode(value, { stream: true });
    }
    if (task.log.includes(`[${name} succeeded]`)) {
      if (name === 'build') task.buildOk = true;
      if (name === 'start') task.startOk = true;
      if (name === 'down') task.startOk = false;
      if (name === 'rebuild') {
        task.buildOk = true;
        task.startOk = false;
      }
      onchange?.(name);
    } else if (task.log.includes(`[${name} failed`)) {
      task.failedTask = name;
    }
  } catch (e) {
    task.log += `\n[connection lost: ${e.message}]\n`;
    task.failedTask = name;
  } finally {
    clearInterval(ticker);
    task.name = '';
  }
}
