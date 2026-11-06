import { VeilleClient } from "@veilleio/sdk";

const client = new VeilleClient({ apiKey: process.env.VEILLE_API_KEY });

const submitted = await client.intelligenceEmail({
  query: "jane.doe@example.com",
  is_async: true,
});
const job = await client.waitForJob(submitted.data.job_id, {
  onProgress: (j) => console.log(`${j.status} ${j.progress ?? 0}%`),
});
console.log(JSON.stringify(job.data, null, 2));
