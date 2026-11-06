// Generated from the Veille OpenAPI document. Do not edit by hand.

import type { OpenString } from "./types.js";

/** Parameters for operations that take none. */
export type EmptyParams = Record<string, never>;

/** Parameters for `intelligenceDomain()` — `GET /v1/intelligence/domain`. */
export interface IntelligenceDomainParams {
  /** The domain to validate. Accepts raw domains (tempmail.org), full URLs (https://www.tempmail.org/page), or domains with www. prefix, all are normalized automatically. */
  query: string;
  /** Enable Certificate Transparency lookup. Returns SSL/TLS certificate history, current certificate, issuers, and all Subject Alternative Names (SANs) ever associated with the domain. Adds 1-5 seconds of latency. Default: `false`. */
  certificate_transparency?: boolean | undefined;
  /** Comma-separated list of fields to keep in the response, with dot notation for nested fields (e.g. name,location.city). Does not change the credit cost. */
  fields?: string | undefined;
  /** Process the request asynchronously: the response is a job_id to poll on /v1/jobs/{id} (see waitForJob). Default: `false`. */
  is_async?: boolean | undefined;
  /** Return HTTP 200 even when an error occurs; the error is then in the response body. Default: `false`. */
  soft_fail?: boolean | undefined;
}

/** Parameters for `intelligenceEmail()` — `GET /v1/intelligence/email`. */
export interface IntelligenceEmailParams {
  /** The email address to validate (e.g. john@example.com). Automatically normalized to lowercase. */
  query: string;
  /** Comma-separated list of fields to keep in the response, with dot notation for nested fields (e.g. name,location.city). Does not change the credit cost. */
  fields?: string | undefined;
  /** Process the request asynchronously: the response is a job_id to poll on /v1/jobs/{id} (see waitForJob). Default: `false`. */
  is_async?: boolean | undefined;
  /** Return HTTP 200 even when an error occurs; the error is then in the response body. Default: `false`. */
  soft_fail?: boolean | undefined;
}

/** Parameters for `intelligenceEmailq()` — `GET /v1/intelligence/emailq`. */
export interface IntelligenceEmailqParams {
  /** The email address to qualify (e.g. john@example.com). Automatically normalized to lowercase. */
  query: string;
  /** Comma-separated list of fields to keep in the response, with dot notation for nested fields (e.g. name,location.city). Does not change the credit cost. */
  fields?: string | undefined;
  /** Process the request asynchronously: the response is a job_id to poll on /v1/jobs/{id} (see waitForJob). Default: `false`. */
  is_async?: boolean | undefined;
  /** Return HTTP 200 even when an error occurs; the error is then in the response body. Default: `false`. */
  soft_fail?: boolean | undefined;
}

/** Parameters for `intelligenceIp()` — `GET /v1/intelligence/ip`. */
export interface IntelligenceIpParams {
  /** The IP address to analyze (IPv4 or IPv6). */
  query: string;
  /** Comma-separated list of fields to keep in the response, with dot notation for nested fields (e.g. name,location.city). Does not change the credit cost. */
  fields?: string | undefined;
  /** Process the request asynchronously: the response is a job_id to poll on /v1/jobs/{id} (see waitForJob). Default: `false`. */
  is_async?: boolean | undefined;
  /** Return HTTP 200 even when an error occurs; the error is then in the response body. Default: `false`. */
  soft_fail?: boolean | undefined;
}

/** Parameters for `intelligencePhone()` — `GET /v1/intelligence/phone`. */
export interface IntelligencePhoneParams {
  /** The phone number to validate in E.164 format (must start with +, e.g. +33612345678). */
  query: string;
  /** Comma-separated list of fields to keep in the response, with dot notation for nested fields (e.g. name,location.city). Does not change the credit cost. */
  fields?: string | undefined;
  /** Process the request asynchronously: the response is a job_id to poll on /v1/jobs/{id} (see waitForJob). Default: `false`. */
  is_async?: boolean | undefined;
  /** Return HTTP 200 even when an error occurs; the error is then in the response body. Default: `false`. */
  soft_fail?: boolean | undefined;
}

/** Parameters for `jobs()` — `GET /v1/jobs/{id}`. */
export interface JobsParams {
  /** The job_id returned by an endpoint called with is_async=true. */
  id: string;
}

/** Parameters for `stats()` — `GET /v1/stats`. */
export interface StatsParams {
  /** API family to check, for example vat. Provide at least engine or path. */
  engine?: string | undefined;
  /** Specific endpoint to check, for example /v1/vat. If you also pass engine, use an endpoint from that API. */
  path?: string | undefined;
}

/** Parameters for `vat()` — `GET /v1/vat`. */
export interface VatParams {
  /** The VAT number to validate (e.g. FR40303265045). */
  query: string;
  /** Comma-separated list of fields to keep in the response, with dot notation for nested fields (e.g. name,location.city). Does not change the credit cost. */
  fields?: string | undefined;
  /** Process the request asynchronously: the response is a job_id to poll on /v1/jobs/{id} (see waitForJob). Default: `false`. */
  is_async?: boolean | undefined;
  /** Return HTTP 200 even when an error occurs; the error is then in the response body. Default: `false`. */
  soft_fail?: boolean | undefined;
}

/** Parameters for `vatIban()` — `GET /v1/vat/iban`. */
export interface VatIbanParams {
  /** The IBAN to validate (e.g. FR7630006000011234567890189). */
  query: string;
  /** Comma-separated list of fields to keep in the response, with dot notation for nested fields (e.g. name,location.city). Does not change the credit cost. */
  fields?: string | undefined;
  /** Process the request asynchronously: the response is a job_id to poll on /v1/jobs/{id} (see waitForJob). Default: `false`. */
  is_async?: boolean | undefined;
  /** Return HTTP 200 even when an error occurs; the error is then in the response body. Default: `false`. */
  soft_fail?: boolean | undefined;
}

/** Parameters for `vatRates()` — `GET /v1/vat/rates`. */
export interface VatRatesParams {
  /** Base currency ISO 4217 code (defaults to EUR). Default: `"EUR"`. */
  base?: string | undefined;
  /** Comma-separated target currency codes to filter (e.g. USD,GBP,JPY). */
  symbols?: string | undefined;
  /** Comma-separated list of fields to keep in the response, with dot notation for nested fields (e.g. name,location.city). Does not change the credit cost. */
  fields?: string | undefined;
  /** Process the request asynchronously: the response is a job_id to poll on /v1/jobs/{id} (see waitForJob). Default: `false`. */
  is_async?: boolean | undefined;
  /** Return HTTP 200 even when an error occurs; the error is then in the response body. Default: `false`. */
  soft_fail?: boolean | undefined;
}
