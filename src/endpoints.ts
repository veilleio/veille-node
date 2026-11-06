// Generated from the Veille OpenAPI document. Do not edit by hand.

import type { EndpointDefinition } from "./types.js";

/** Every documented operation, keyed by its snake_case name. */
export const ENDPOINTS = {
  intelligence_domain: {
    path: "/v1/intelligence/domain",
    methods: ["GET"],
    response: "json",
    required: ["query"],
  },
  intelligence_email: {
    path: "/v1/intelligence/email",
    methods: ["GET"],
    response: "json",
    required: ["query"],
  },
  intelligence_emailq: {
    path: "/v1/intelligence/emailq",
    methods: ["GET"],
    response: "json",
    required: ["query"],
  },
  intelligence_ip: {
    path: "/v1/intelligence/ip",
    methods: ["GET"],
    response: "json",
    required: ["query"],
  },
  intelligence_phone: {
    path: "/v1/intelligence/phone",
    methods: ["GET"],
    response: "json",
    required: ["query"],
  },
  jobs: {
    path: "/v1/jobs/{id}",
    methods: ["GET"],
    response: "json",
    required: ["id"],
  },
  stats: {
    path: "/v1/stats",
    methods: ["GET"],
    response: "json",
    required: [],
  },
  usage: {
    path: "/v1/usage",
    methods: ["GET"],
    response: "json",
    required: [],
  },
  vat: {
    path: "/v1/vat",
    methods: ["GET"],
    response: "json",
    required: ["query"],
  },
  vat_iban: {
    path: "/v1/vat/iban",
    methods: ["GET"],
    response: "json",
    required: ["query"],
  },
  vat_rates: {
    path: "/v1/vat/rates",
    methods: ["GET"],
    response: "json",
    required: [],
  },
} as const satisfies Record<string, EndpointDefinition>;

export type EndpointName = keyof typeof ENDPOINTS;
