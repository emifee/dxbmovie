const POLL_INTERVAL_MS = 5000;
const ENDPOINT = "http://localhost:3000/api/cron/process-comments";

async function poll() {
  try {
    const res = await fetch(ENDPOINT);
    const data = await res.json();
    if (data.processed > 0) {
      console.log(`[worker] Processed ${data.processed} comment jobs.`);
    }
  } catch (err) {
    console.error("[worker] Error polling process-comments:", err.message);
  } finally {
    setTimeout(poll, POLL_INTERVAL_MS);
  }
}

console.log(`[worker] Starting comment job worker. Polling every ${POLL_INTERVAL_MS}ms.`);
poll();
