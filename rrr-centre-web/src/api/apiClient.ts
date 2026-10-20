/**
 * Centralized HTTP layer — every API call in the app goes through this,
 * mirroring the Flutter Home User/Collector app's ApiClient design:
 * attaches Bearer tokens and Idempotency-Key headers, parses the
 * backend's structured {success:false,error_code,message} contract,
 * and turns FastAPI's differently-shaped 422 validation errors and raw
 * network/timeout failures into the same one ApiError type so every
 * screen handles failures identically.
 */

export class ApiError extends Error {
  readonly errorCode: string
  readonly statusCode?: number

  constructor(errorCode: string, message: string, statusCode?: number) {
    super(message)
    this.errorCode = errorCode
    this.statusCode = statusCode
  }

  get isInvalidToken(): boolean {
    return this.errorCode === 'INVALID_TOKEN'
  }
}

// Deliberately 127.0.0.1, not "localhost": on a dual-stack machine the
// browser can resolve "localhost" to the IPv6 loopback (::1) for one
// page/request and get a real connection refusal talking to a server
// that (like our backend, started with --host 0.0.0.0) only listens on
// the IPv4 loopback — which surfaces here as an indistinguishable
// NETWORK_ERROR ("Could not reach the server"), not a CORS or backend
// error. 127.0.0.1 is a literal address, never a DNS/hosts lookup, so
// there is no IPv4/IPv6 ambiguity to resolve differently per request.
const DEFAULT_BASE_URL = 'http://127.0.0.1:8000'
const REQUEST_TIMEOUT_MS = 15_000

function resolveBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL as string | undefined
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BASE_URL
}

export interface ApiClientOptions {
  baseUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export class ApiClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? resolveBaseUrl()
    // .bind(globalThis) is required here, not cosmetic: native browser
    // fetch is a WebIDL-bound method on Window with an internal brand
    // check on its receiver. Storing the bare reference (`fetch`) as an
    // instance property and later invoking it as `this.fetchImpl(...)`
    // calls it with `this` set to the ApiClient instance instead of
    // window — real browsers throw a synchronous "TypeError: Failed to
    // execute 'fetch' on 'Window': Illegal invocation" for that, before
    // any network activity starts. Our own try/catch around the call
    // silently turns that into a generic NETWORK_ERROR, which is why the
    // symptom was "Could not reach the server" with zero requests ever
    // appearing in the Network tab and no uncaught console error. Binding
    // to globalThis up front makes the receiver irrelevant no matter how
    // it's later called.
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis)
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS
  }

  async get<T>(path: string, token?: string): Promise<T> {
    return this.send<T>('GET', path, undefined, token)
  }

  async post<T>(path: string, body?: unknown, token?: string, idempotencyKey?: string): Promise<T> {
    return this.send<T>('POST', path, body, token, idempotencyKey)
  }

  private async send<T>(
    method: string,
    path: string,
    body: unknown,
    token?: string,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiError('NETWORK_TIMEOUT', 'The server took too long to respond. Please try again.')
      }
      throw new ApiError('NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.')
    } finally {
      clearTimeout(timeout)
    }

    let parsedBody: unknown = null
    try {
      const text = await response.text()
      parsedBody = text.length > 0 ? JSON.parse(text) : null
    } catch {
      parsedBody = null
    }

    if (response.ok) {
      return (parsedBody ?? {}) as T
    }

    if (isStructuredError(parsedBody)) {
      throw new ApiError(parsedBody.error_code, parsedBody.message, response.status)
    }

    if (response.status === 422 && isFastApiValidationError(parsedBody)) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'The request was invalid. Please check the form and try again.',
        response.status,
      )
    }

    throw new ApiError('UNKNOWN_ERROR', `Something went wrong (HTTP ${response.status}).`, response.status)
  }
}

function isStructuredError(body: unknown): body is { error_code: string; message: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error_code' in body &&
    'message' in body &&
    typeof (body as Record<string, unknown>).error_code === 'string' &&
    typeof (body as Record<string, unknown>).message === 'string'
  )
}

function isFastApiValidationError(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'detail' in body
}

export const apiClient = new ApiClient()
