// Smoke check run after the production server is up (see the "smoke" script).
// `start-server-and-test` already waits for the root URL to respond; this step
// goes further and asserts the response is a real 200 HTML document, so a
// startup crash that still serves an error page — or an empty body — fails CI
// instead of passing a no-op.
const url = process.env.SMOKE_URL ?? "http://127.0.0.1:3000";

try {
  const res = await fetch(url);
  const body = await res.text();

  if (!res.ok) {
    throw new Error(`expected HTTP 200, got ${res.status} ${res.statusText}`);
  }
  if (!body.includes("<html")) {
    throw new Error(`response from ${url} is not an HTML document (${body.length} bytes)`);
  }

  console.log(`smoke ok: ${res.status} from ${url}, ${body.length} bytes of HTML`);
} catch (err) {
  console.error(`smoke check failed: ${err.message}`);
  process.exit(1);
}
