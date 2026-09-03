/** Erreur applicative renvoyée au front sous la forme `{ code, error }`. */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notConfigured = (what: string) =>
  new ApiError(409, 'not_configured', `Configuration incomplète : ${what}.`);
export const badRequest = (message: string) => new ApiError(400, 'bad_request', message);
