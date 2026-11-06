import { VeilleClient } from "@veilleio/sdk";

const client = new VeilleClient({ apiKey: process.env.VEILLE_API_KEY });

const response = await client.intelligenceEmail({
  query: "jane.doe@example.com",
});
console.log(JSON.stringify(response.data, null, 2));
