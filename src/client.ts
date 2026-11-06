import {
  VeilleApiError,
  VeilleConfigurationError,
  VeilleResponseDecodingError,
  VeilleSerializationError,
  VeilleTransportError,
  VeilleJobTimeoutError,
} from "./errors.js";
import { ENDPOINTS, type EndpointName } from "./endpoints.js";
import type * as Params from "./params.js";
import { encodeQueryPairs, serializeRequest } from "./serialization.js";
import type {
  ApiResponse,
  BatchOptions,
  BatchResult,
  BinaryResponse,
  HttpMethod,
  JsonResponse,
  RawResponse,
  RequestOptions,
  VeilleClientOptions,
  VeilleFetch,
  WaitForJobOptions,
} from "./types.js";
import { VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://api.veille.io";
export const DEFAULT_TIMEOUT_MS = 120_000;
/** Retries after a network error or a 408, 429, 500, 502, 503 or 504 response. */
export const MAX_RETRIES = 3;
/** Delay before the first retry, in milliseconds. */
export const DEFAULT_RETRY_DELAY_MS = 1_000;
/** Each retry waits this many times longer than the previous one (a Retry-After header wins). */
export const RETRY_BACKOFF_FACTOR = 1.5;
/** Longest wait between two attempts, in milliseconds. */
export const MAX_RETRY_DELAY_MS = 30_000;
/** Tasks run at the same time by batch(). */
export const DEFAULT_CONCURRENCY = 10;
const RETRYABLE_STATUSES = new Set([408, 500, 502, 503, 504]);

/**
 * Server errors and plan rate limits are retried. The API reports rate limits as 401 (or 429) with a
 * "Rate limit exceeded" message; per-key quotas ("…: quota daily") do not reset within seconds, so they are not.
 */
function isRetryable(rawResponse: RawResponse): boolean {
  if (RETRYABLE_STATUSES.has(rawResponse.status)) return true;
  if (rawResponse.status !== 401 && rawResponse.status !== 429) return false;
  const message = (
    createApiError(rawResponse).errorMessage ?? ""
  ).toLowerCase();
  if (message.includes("quota")) return false;
  return (
    message.includes("rate limit") ||
    (rawResponse.status === 429 && message === "")
  );
}
const API_KEY_ENVIRONMENT_VARIABLE = "VEILLE_API_KEY";

type EmptyParams = Params.EmptyParams;

/**
 * Official Veille API client. Create one instance and reuse it.
 */
export class VeilleClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #timeout: number;
  readonly #maxRetries: number;
  readonly #retryDelay: number;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #fetch: VeilleFetch;

  constructor(options: VeilleClientOptions = {}) {
    if (
      typeof options !== "object" ||
      options === null ||
      Array.isArray(options)
    ) {
      throw new VeilleConfigurationError(
        "VeilleClient options must be an object.",
      );
    }
    const apiKey =
      options.apiKey ?? readEnvironment(API_KEY_ENVIRONMENT_VARIABLE);
    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
      throw new VeilleConfigurationError(
        `A non-blank Veille API key is required. Pass apiKey or set ${API_KEY_ENVIRONMENT_VARIABLE}.`,
      );
    }
    try {
      new Headers({ "x-api-key": apiKey });
    } catch (cause) {
      throw new VeilleConfigurationError(
        "The Veille API key cannot be used in an HTTP header.",
        { cause },
      );
    }

    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(baseUrl);
    } catch (cause) {
      throw new VeilleConfigurationError("baseUrl must be an absolute URL.", {
        cause,
      });
    }
    if (
      parsedBaseUrl.protocol !== "https:" &&
      parsedBaseUrl.protocol !== "http:"
    ) {
      throw new VeilleConfigurationError("baseUrl must use http or https.");
    }

    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    if (
      typeof timeout !== "number" ||
      !Number.isFinite(timeout) ||
      timeout < 0
    ) {
      throw new VeilleConfigurationError(
        "timeout must be a non-negative number of milliseconds.",
      );
    }

    const maxRetries = options.maxRetries ?? MAX_RETRIES;
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new VeilleConfigurationError(
        "maxRetries must be a non-negative integer.",
      );
    }
    const retryDelayMs = options.retryDelay ?? DEFAULT_RETRY_DELAY_MS;
    if (
      typeof retryDelayMs !== "number" ||
      !Number.isFinite(retryDelayMs) ||
      retryDelayMs < 0
    ) {
      throw new VeilleConfigurationError(
        "retryDelay must be a non-negative number of milliseconds.",
      );
    }

    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== "function") {
      throw new VeilleConfigurationError(
        "A Fetch-compatible transport is required.",
      );
    }

    this.#apiKey = apiKey;
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#timeout = timeout;
    this.#maxRetries = maxRetries;
    this.#retryDelay = retryDelayMs;
    this.#headers = Object.freeze({ ...(options.headers ?? {}) });
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Sends any request to the Veille API. Use it for endpoints released after this SDK version.
   * GET parameters travel in the query string; POST parameters travel in a JSON body.
   */
  async request<T = any>(
    method: HttpMethod,
    path: string,
    params?: Readonly<Record<string, unknown>> | null,
    options?: RequestOptions | null,
  ): Promise<ApiResponse<T>> {
    return this.#send<T>(method, path, params, options, "any");
  }

  /**
   * Runs `task` for every item with at most `concurrency` tasks in flight (default 10) and returns one result per
   * item, in input order. A failing item never stops the others.
   *
   * ```ts
   * const results = await client.batch(ids, (id) => client.someEndpoint({ query: id }));
   * ```
   */
  async batch<I, T>(
    items: Iterable<I>,
    task: (item: I, index: number) => Promise<T>,
    options: BatchOptions = {},
  ): Promise<BatchResult<T>[]> {
    const list = [...items];
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new VeilleConfigurationError(
        "concurrency must be a positive integer.",
      );
    }
    const results: BatchResult<T>[] = new Array(list.length);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < list.length) {
        const index = next++;
        options.signal?.throwIfAborted();
        try {
          results[index] = {
            status: "fulfilled",
            index,
            value: await task(list[index]!, index),
          };
        } catch (reason) {
          results[index] = { status: "rejected", index, reason };
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, list.length) }, worker),
    );
    return results;
  }

  /**
   * Domain Validation. Check any domain instantly. Detects disposable email providers, public webmail, relay services, and education domains. Returns DNS health with MX provider detection, domain history, and optional SSL/TLS certificate transparency. Credit cost: 2 credits per call.
   *
   * `GET /v1/intelligence/domain`
   */
  intelligenceDomain<T = any>(
    params: Params.IntelligenceDomainParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("intelligence_domain", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  /**
   * Email Validation. Validate any email address in a single call. Detects disposable and temporary inboxes, identifies role accounts, public webmail, relay services, and returns a 0-100 risk score. For deep deliverability verification (SMTP check, catch-all de… Credit cost: 3 credits per call.
   *
   * `GET /v1/intelligence/email`
   */
  intelligenceEmail<T = any>(
    params: Params.IntelligenceEmailParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("intelligence_email", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  /**
   * Email Qualification. Deep email deliverability verification. Performs full Email Validation plus SMTP inbox check, catch-all detection, and returns a qualification verdict (valid, invalid, risky, disposable, unknown). Credit cost: 5 credits per call.
   *
   * `GET /v1/intelligence/emailq`
   */
  intelligenceEmailq<T = any>(
    params: Params.IntelligenceEmailqParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("intelligence_emailq", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  /**
   * IP Reputation. Assess the reputation of any IP address. Detects VPNs, proxies, Tor exit nodes, datacenter hosting, abusive traffic, and bots. Returns geolocation, network owner, and a 0-100 threat score. Credit cost: 2 credits per call.
   *
   * `GET /v1/intelligence/ip`
   */
  intelligenceIp<T = any>(
    params: Params.IntelligenceIpParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("intelligence_ip", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  /**
   * Phone Validation. Validate any phone number in E.164 format. Detects disposable and virtual numbers, identifies carrier and line type (mobile/fixed/VoIP), returns country and timezone, and computes a 0-100 risk score. Credit cost: 1 credit per call.
   *
   * `GET /v1/intelligence/phone`
   */
  intelligencePhone<T = any>(
    params: Params.IntelligencePhoneParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("intelligence_phone", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  /**
   * Jobs. Poll the status, progress (0–100) and result of a job started with is_async=true. Polling is free. Poll until status is terminal: CompletedJob, Error, NotFound or BadRequest.
   *
   * `GET /v1/jobs/{id}`
   */
  jobs<T = any>(
    params: Params.JobsParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("jobs", params, options) as Promise<JsonResponse<T>>;
  }

  /**
   * Stats. Infrastructure health for an engine or endpoint over the last hour. Not scoped to your account or tenant. Enabled per account: HTTP 403 means contact support to activate it.
   *
   * `GET /v1/stats`
   */
  stats<T = any>(
    params?: Params.StatsParams | null,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("stats", params, options) as Promise<JsonResponse<T>>;
  }

  /**
   * Usage. Retrieve real-time usage statistics and credit balance for your Veille account.
   *
   * `GET /v1/usage`
   */
  usage<T = any>(
    params?: EmptyParams | null,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("usage", params, options) as Promise<JsonResponse<T>>;
  }

  /**
   * VAT Validation. Validate a European VAT number against the VIES database. Returns company name, registered address, and validity status for any EU member state. Credit cost: 1 credit per call.
   *
   * `GET /v1/vat`
   */
  vat<T = any>(
    params: Params.VatParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("vat", params, options) as Promise<JsonResponse<T>>;
  }

  /**
   * IBAN Validation. Validate any IBAN and retrieve associated bank details. Returns the BIC/SWIFT code, bank name, country, BBAN structural breakdown, and SEPA zone membership. Credit cost: 1 credit per call.
   *
   * `GET /v1/vat/iban`
   */
  vatIban<T = any>(
    params: Params.VatIbanParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("vat_iban", params, options) as Promise<JsonResponse<T>>;
  }

  /**
   * Exchange Rates. Get current ECB exchange rates for any supported base currency. Optionally filter to specific target currencies. Updated daily from the European Central Bank. Credit cost: 1 credit per call.
   *
   * `GET /v1/vat/rates`
   */
  vatRates<T = any>(
    params?: Params.VatRatesParams | null,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("vat_rates", params, options) as Promise<JsonResponse<T>>;
  }

  /**
   * Polls `GET /v1/jobs/{id}` until the job reaches a terminal status
   * (CompletedJob, Error, NotFound, BadRequest) and returns the final job document.
   */
  async waitForJob<T = any>(
    jobId: string,
    options: WaitForJobOptions = {},
  ): Promise<JsonResponse<T>> {
    if (typeof jobId !== "string" || jobId.trim().length === 0) {
      throw new VeilleSerializationError(
        "A non-blank job id is required.",
        "id",
      );
    }
    let delayMs = options.intervalMs ?? 3_000;
    const maxDelayMs = Math.max(delayMs, MAX_POLL_INTERVAL_MS);
    const timeoutMs = options.timeoutMs ?? 43_200_000;
    const startedAt = Date.now();
    let last: JsonResponse<T> | undefined;
    for (;;) {
      options.signal?.throwIfAborted();
      const response = await this.request<T>(
        "GET",
        "/v1/jobs/{id}",
        { id: jobId },
        options.signal ? { signal: options.signal } : null,
      );
      if (response.kind !== "json") {
        throw new VeilleResponseDecodingError(
          "The job endpoint did not return JSON.",
          response.rawResponse,
        );
      }
      last = response;
      options.onProgress?.(last.data);
      const status = (last.data as { status?: unknown } | null)?.status;
      if (typeof status === "string" && JOB_TERMINAL_STATUSES.includes(status))
        return last;
      if (Date.now() - startedAt + delayMs > timeoutMs) {
        throw new VeilleJobTimeoutError(jobId, last);
      }
      await sleep(delayMs, options.signal ?? undefined);
      delayMs = Math.min(delayMs * 1.5, maxDelayMs);
    }
  }

  async #call(
    name: EndpointName,
    params: Readonly<object> | null | undefined,
    options: RequestOptions | null | undefined,
  ): Promise<ApiResponse> {
    const endpoint = ENDPOINTS[name];
    const supported: readonly HttpMethod[] = endpoint.methods;
    const method = options?.method ?? supported[0] ?? "GET";
    if (!supported.includes(method)) {
      throw new VeilleConfigurationError(
        `${endpoint.path} supports ${supported.join(", ")}, not ${method}.`,
      );
    }
    const values = (params ?? {}) as Readonly<Record<string, unknown>>;
    for (const name of endpoint.required as readonly string[]) {
      if (values[name] === undefined || values[name] === null) {
        throw new VeilleSerializationError(
          `The "${name}" parameter is required.`,
          name,
        );
      }
    }
    return this.#send(
      method,
      endpoint.path,
      values,
      { ...options, method },
      endpoint.response,
    );
  }

  async #send<T>(
    method: HttpMethod,
    path: string,
    params: Readonly<Record<string, unknown>> | null | undefined,
    options: RequestOptions | null | undefined,
    expected: "json" | "any",
  ): Promise<ApiResponse<T>> {
    if (method !== "GET" && method !== "POST") {
      throw new VeilleConfigurationError(
        `Unsupported HTTP method: ${String(method)}.`,
      );
    }
    if (typeof path !== "string" || !path.startsWith("/")) {
      throw new VeilleConfigurationError(
        'The request path must start with "/".',
      );
    }
    const serialized = serializeRequest(method, path, params);
    const url = new URL(this.#baseUrl + serialized.path);
    if (serialized.query.length > 0)
      url.search = encodeQueryPairs(serialized.query);

    const headers = new Headers({
      Accept: "application/json, */*;q=0.8",
      "User-Agent": `veille-node/${VERSION}`,
      ...this.#headers,
      ...(options?.headers ?? {}),
      "x-api-key": this.#apiKey,
    });
    const init: RequestInit = { method, headers, redirect: "manual" };
    if (serialized.body !== undefined) {
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify(serialized.body);
    }

    const timeout = options?.timeout ?? this.#timeout;
    const maxRetries = options?.maxRetries ?? this.#maxRetries;
    let rawResponse: RawResponse;
    for (let attempt = 0; ; attempt++) {
      options?.signal?.throwIfAborted();
      const signals: AbortSignal[] = [];
      if (options?.signal) signals.push(options.signal);
      const deadline = timeout > 0 ? AbortSignal.timeout(timeout) : undefined;
      if (deadline) signals.push(deadline);
      if (signals.length > 0)
        init.signal =
          signals.length === 1 ? signals[0]! : AbortSignal.any(signals);

      try {
        const response = await this.#fetch(url, init);
        const body = new Uint8Array(await response.arrayBuffer());
        rawResponse = createRawResponse(response, body);
      } catch (cause) {
        if (options?.signal?.aborted) throw cause;
        if (deadline?.aborted) {
          throw new VeilleTransportError(
            `Veille request timed out after ${timeout} ms.`,
            cause,
          );
        }
        if (attempt < maxRetries) {
          await sleep(
            retryDelay(this.#retryDelay, attempt, undefined),
            options?.signal ?? undefined,
          );
          continue;
        }
        throw new VeilleTransportError(
          "Veille request failed before an HTTP response body was received.",
          cause,
        );
      }

      if (rawResponse.status >= 200 && rawResponse.status <= 299) break;
      if (isRetryable(rawResponse) && attempt < maxRetries) {
        const retryAfter = rawResponse.headers.get("retry-after")?.[0];
        await sleep(
          retryDelay(this.#retryDelay, attempt, retryAfter),
          options?.signal ?? undefined,
        );
        continue;
      }
      throw createApiError(rawResponse);
    }
    return decodeSuccessResponse<T>(rawResponse, expected);
  }
}

function retryDelay(
  baseMs: number,
  attempt: number,
  retryAfter: string | undefined,
): number {
  const seconds = retryAfter === undefined ? Number.NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.min(seconds * 1_000, 60_000);
  return Math.min(baseMs * RETRY_BACKOFF_FACTOR ** attempt, MAX_RETRY_DELAY_MS);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function readEnvironment(name: string): string | undefined {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  const value = env?.[name];
  return value === undefined || value === "" ? undefined : value;
}

function createRawResponse(response: Response, body: Uint8Array): RawResponse {
  const headers = new Map<string, readonly string[]>();
  for (const [name, value] of response.headers) {
    headers.set(name.toLowerCase(), Object.freeze([value]));
  }
  const getSetCookie = (
    response.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  if (typeof getSetCookie === "function") {
    const values = getSetCookie.call(response.headers);
    if (values.length > 0)
      headers.set("set-cookie", Object.freeze([...values]));
  }
  return {
    status: response.status,
    statusText: response.statusText,
    headers,
    contentType: response.headers.get("content-type"),
    body,
  };
}

function createApiError(rawResponse: RawResponse): VeilleApiError {
  const parsed = tryParseJson(rawResponse.body);
  const objectBody =
    parsed.ok && isJsonObject(parsed.value) ? parsed.value : null;
  let errorMessage: string | undefined;
  for (const key of ["error", "message", "error_message", "detail"]) {
    const value = objectBody?.[key];
    if (typeof value === "string" && value.length > 0) {
      errorMessage = value;
      break;
    }
  }
  return new VeilleApiError({
    rawResponse,
    ...(parsed.ok ? { responseBody: parsed.value } : {}),
    ...(errorMessage === undefined ? {} : { errorMessage }),
  });
}

function decodeSuccessResponse<T>(
  rawResponse: RawResponse,
  expected: "json" | "any",
): ApiResponse<T> {
  if (!isJsonMediaType(rawResponse.contentType)) {
    if (expected === "json") {
      throw new VeilleResponseDecodingError(
        "Veille returned a successful non-JSON response for a JSON operation.",
        rawResponse,
        new TypeError(
          `Unexpected content type: ${rawResponse.contentType ?? "none"}.`,
        ),
      );
    }
    const binary: BinaryResponse = {
      kind: "binary",
      bytes: rawResponse.body,
      contentType: rawResponse.contentType,
      rawResponse,
    };
    return binary;
  }
  const parsed = tryParseJson(rawResponse.body);
  if (!parsed.ok) {
    throw new VeilleResponseDecodingError(
      "Veille returned a successful JSON response that could not be decoded.",
      rawResponse,
      parsed.cause,
    );
  }
  const json: JsonResponse<T> = {
    kind: "json",
    data: parsed.value as T,
    rawResponse,
  };
  return json;
}

function isJsonMediaType(contentType: string | null): boolean {
  if (contentType === null) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return (
    mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"))
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryParseJson(
  body: Uint8Array,
): { ok: true; value: unknown } | { ok: false; cause: unknown } {
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body)) };
  } catch (cause) {
    return { ok: false, cause };
  }
}

export const JOB_TERMINAL_STATUSES: readonly string[] = [
  "CompletedJob",
  "Error",
  "NotFound",
  "BadRequest",
];
const MAX_POLL_INTERVAL_MS = 60_000;
