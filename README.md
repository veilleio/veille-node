# Veille Node.js SDK

The official Node.js and TypeScript SDK for the [Veille](https://www.veille.io) fraud prevention API.

Validate emails, domains, IPs, VAT numbers and IBANs in milliseconds to block fake sign-ups, bots and fraud.

The SDK exposes **11 typed methods**, one per documented endpoint, plus a generic `request()` for anything else.

## Requirements

- Node.js 20 or newer

## Installation

```sh
npm install @veilleio/sdk
```

The SDK works with TypeScript and JavaScript (ES modules). The examples below use TypeScript; JavaScript users can use the same API by omitting TypeScript-only syntax.

## Get your API key

[Sign up for Veille](https://app.veille.io/register) or sign in to your existing account, then copy your API key from the [dashboard](https://app.veille.io). Store it securely, for example in the `VEILLE_API_KEY` environment variable, which the client reads by default.

## Quick start

```ts
import { VeilleClient } from "@veilleio/sdk";

const client = new VeilleClient({ apiKey: process.env.VEILLE_API_KEY });

const response = await client.intelligenceEmail({
  query: "jane.doe@example.com",
});
console.log(response.data);
```

Every method takes a parameter object that mirrors the [API reference](https://app.veille.io/openapi) (snake_case names, exactly as documented) and an optional `RequestOptions` object.

## Async jobs

Any call accepts `is_async: true` (useful past the 60-second server limit): the response is then a `job_id`. `waitForJob()` polls `GET /v1/jobs/{id}` until the job reaches a terminal status (`CompletedJob`, `Error`, `NotFound`, `BadRequest`):

```ts
const submitted = await client.intelligenceEmail({
  query: "jane.doe@example.com",
  is_async: true,
});
const job = await client.waitForJob(submitted.data.job_id, {
  onProgress: (j) => console.log(`${j.status} ${j.progress ?? 0}%`),
});
console.log(JSON.stringify(job.data, null, 2));
```

## GET or POST

Methods use GET when the endpoint supports it: parameters travel in the query string. POST sends the same parameters as a JSON body.

`null`, `undefined` and empty arrays are omitted, `false` and `0` are sent, and arrays repeat the parameter name (`a=1&a=2`).

## Any endpoint

`request()` reaches any path, including endpoints released after this SDK version:

```ts
const response = await client.request("GET", "/v1/usage");
```

## Responses

- `JsonResponse` — `kind: "json"`, the parsed body in `data` (pass a type argument to type it: `client.intelligenceEmail<MyType>(…)`).
- `BinaryResponse` — `kind: "binary"`, the body in `bytes` and its `contentType`.

Both keep the buffered `rawResponse` (status, headers, content type, body bytes).

## Errors

```ts
import { VeilleApiError } from "@veilleio/sdk";

try {
  await client.intelligenceEmail({ query: "jane.doe@example.com" });
} catch (error) {
  if (error instanceof VeilleApiError) {
    console.error(error.status, error.message, error.responseBody);
  }
  throw error;
}
```

| Error                         | When                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `VeilleConfigurationError`    | Missing API key, invalid options or unsupported method.                       |
| `VeilleSerializationError`    | A required parameter is missing or a value can't be sent.                     |
| `VeilleTransportError`        | Network failure or client-side timeout.                                       |
| `VeilleApiError`              | The API answered with a non-2xx status (`status`, `message`, `responseBody`). |
| `VeilleResponseDecodingError` | A success response could not be decoded.                                      |

All of them extend `VeilleError`. Common statuses: `400` invalid parameters, `401` invalid API key, `402` no credits left, `429` rate limit exceeded.

## Retries

Requests are retried up to 3 times after a network error, a `408`, `500`, `502`, `503` or `504`, or a rate limit — which the API returns as `401` (or `429`) with a `Rate limit exceeded` message. Per-key quota errors (`…: quota daily`) are not retried, nor are `400`, `402`, `404` or client-side timeouts. The delay starts at 1 second and grows 1.5× per retry (capped at 30 seconds); a `Retry-After` header wins.

```ts
const client = new VeilleClient({ maxRetries: 5, retryDelay: 500 });

// or for one request
await client.intelligenceEmail(
  { query: "jane.doe@example.com" },
  { maxRetries: 0 },
);
```

## Batch requests

`batch()` runs a task per item with at most 10 in flight (`concurrency`), and returns one result per item in input order, shaped like `Promise.allSettled`. One failure never stops the others.

```ts
const inputs = [
  "jane.doe@example.com",
  "john@mailinator.com",
  "contact@veille.io",
];
const results = await client.batch(
  inputs,
  (query) => client.intelligenceEmail({ query }),
  { concurrency: 5 },
);

for (const result of results) {
  if (result.status === "fulfilled") console.log(result.value.data);
  else console.error(inputs[result.index], result.reason);
}
```

| Constant                 | Default  | Description                                                     |
| ------------------------ | -------- | --------------------------------------------------------------- |
| `DEFAULT_CONCURRENCY`    | `10`     | Tasks run at the same time by batch                             |
| `DEFAULT_TIMEOUT_MS`     | `120000` | Request timeout (milliseconds)                                  |
| `MAX_RETRIES`            | `3`      | Retry attempts after a network error, a 408/5xx or a rate limit |
| `RETRY_BACKOFF_FACTOR`   | `1.5`    | Exponential backoff multiplier                                  |
| `DEFAULT_RETRY_DELAY_MS` | `1000`   | Delay before the first retry (milliseconds)                     |

## Timeouts and cancellation

```ts
const client = new VeilleClient({ timeout: 60_000 }); // default 120000 ms, 0 disables

await client.intelligenceEmail(
  { query: "jane.doe@example.com" },
  {
    signal: AbortSignal.timeout(30_000),
  },
);
```

## Advanced: custom Fetch transport

```ts
import { VeilleClient, type VeilleFetch } from "@veilleio/sdk";

const loggingFetch: VeilleFetch = async (input, init) => {
  const response = await fetch(input, init);
  console.log(init.method, String(input), response.status);
  return response;
};

const client = new VeilleClient({ fetch: loggingFetch });
```

## Endpoints

11 methods, generated from the [OpenAPI document](https://app.veille.io/openapi).

| Method                 | HTTP                          | Description                                                                                                                                  |
| ---------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `intelligenceDomain()` | GET `/v1/intelligence/domain` | Check any domain instantly. Detects disposable email providers, public webmail, relay services, and education domains. Returns DNS health w… |
| `intelligenceEmail()`  | GET `/v1/intelligence/email`  | Validate any email address in a single call. Detects disposable and temporary inboxes, identifies role accounts, public webmail, relay serv… |
| `intelligenceEmailq()` | GET `/v1/intelligence/emailq` | Deep email deliverability verification. Performs full Email Validation plus SMTP inbox check, catch-all detection, and returns a qualificat… |
| `intelligenceIp()`     | GET `/v1/intelligence/ip`     | Assess the reputation of any IP address. Detects VPNs, proxies, Tor exit nodes, datacenter hosting, abusive traffic, and bots. Returns geol… |
| `intelligencePhone()`  | GET `/v1/intelligence/phone`  | Validate any phone number in E.164 format. Detects disposable and virtual numbers, identifies carrier and line type (mobile/fixed/VoIP), re… |
| `jobs()`               | GET `/v1/jobs/{id}`           | Poll the status, progress (0–100) and result of a job started with is_async=true. Polling is free. Poll until status is terminal: Completed… |
| `stats()`              | GET `/v1/stats`               | Infrastructure health for an engine or endpoint over the last hour. Not scoped to your account or tenant. Enabled per account: HTTP 403 mea… |
| `usage()`              | GET `/v1/usage`               | Retrieve real-time usage statistics and credit balance for your Veille account.                                                              |
| `vat()`                | GET `/v1/vat`                 | Validate a European VAT number against the VIES database. Returns company name, registered address, and validity status for any EU member s… |
| `vatIban()`            | GET `/v1/vat/iban`            | Validate any IBAN and retrieve associated bank details. Returns the BIC/SWIFT code, bank name, country, BBAN structural breakdown, and SEPA… |
| `vatRates()`           | GET `/v1/vat/rates`           | Get current ECB exchange rates for any supported base currency. Optionally filter to specific target currencies. Updated daily from the Eur… |

## All Veille SDKs

| SDK        | Package                                                         | Install                                |
| ---------- | --------------------------------------------------------------- | -------------------------------------- |
| Node.js    | [`@veilleio/sdk`](https://www.npmjs.com/package/@veilleio/sdk)  | `npm install @veilleio/sdk`            |
| Python     | [`veille`](https://pypi.org/project/veille/)                    | `pip install veille`                   |
| Go         | [`veille-go`](https://pkg.go.dev/github.com/veilleio/veille-go) | `go get github.com/veilleio/veille-go` |
| .NET       | [`Veille`](https://www.nuget.org/packages/Veille)               | `dotnet add package Veille`            |
| Ruby       | [`veille`](https://rubygems.org/gems/veille)                    | `gem install veille`                   |
| PHP        | [`veille/sdk`](https://packagist.org/packages/veille/sdk)       | `composer require veille/sdk`          |
| Java       | [`veille-java`](https://github.com/veilleio/veille-java)        | build from source, see its README      |
| CLI        | [`@veilleio/cli`](https://www.npmjs.com/package/@veilleio/cli)  | `npm install -g @veilleio/cli`         |
| MCP server | [`@veilleio/mcp`](https://www.npmjs.com/package/@veilleio/mcp)  | `npx -y @veilleio/mcp`                 |

## License

MIT — see [LICENSE](LICENSE).
