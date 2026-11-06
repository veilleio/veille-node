import type { JsonResponse, RawResponse } from "./types.js";

export class VeilleError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The client configuration is missing or unusable. */
export class VeilleConfigurationError extends VeilleError {}

/** A request value cannot be represented safely on the wire. */
export class VeilleSerializationError extends VeilleError {
  readonly param: string | undefined;

  constructor(message: string, param?: string, options?: ErrorOptions) {
    super(message, options);
    this.param = param;
  }
}

/** The request failed before a complete HTTP response was received. */
export class VeilleTransportError extends VeilleError {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
  }
}

/** Veille returned a non-success HTTP status. */
export class VeilleApiError extends VeilleError {
  readonly status: number;
  readonly errorMessage: string | undefined;
  readonly responseBody: unknown;
  readonly rawResponse: RawResponse;

  constructor(args: {
    rawResponse: RawResponse;
    responseBody?: unknown;
    errorMessage?: string;
  }) {
    super(
      args.errorMessage ??
        `Veille API request failed with status ${args.rawResponse.status}.`,
    );
    this.status = args.rawResponse.status;
    this.errorMessage = args.errorMessage;
    this.responseBody = args.responseBody;
    this.rawResponse = args.rawResponse;
  }
}

/** A successful response could not be decoded as the documented representation. */
export class VeilleResponseDecodingError extends VeilleError {
  readonly rawResponse: RawResponse;

  constructor(message: string, rawResponse: RawResponse, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.rawResponse = rawResponse;
  }
}

/** An async job did not reach a terminal status before the deadline. */
export class VeilleJobTimeoutError extends VeilleError {
  readonly jobId: string;
  readonly lastResponse: JsonResponse | undefined;

  constructor(jobId: string, lastResponse?: JsonResponse) {
    super(`Job ${jobId} did not finish before the deadline.`);
    this.jobId = jobId;
    this.lastResponse = lastResponse;
  }
}
