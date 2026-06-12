// "Finish" button target: reply, then stop the server so the installer
// container (run with --rm by run.sh) exits and the script continues.
export function POST() {
  setTimeout(() => process.exit(0), 250);
  return new Response(
    `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>All-In-Wonder Dashboard</title></head>
  <body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto;">
    <h1>Dashboard stopped</h1>
    <p>The All-In-Wonder Dashboard has stopped — you can close this tab and return to the terminal. The service stack itself keeps running if it was up.</p>
  </body>
</html>`,
    { headers: { 'content-type': 'text/html' } }
  );
}
