export class HoryAuthError extends Error {
  readonly statusCode = 401;
  constructor(message: string) {
    super(message);
    this.name = "HoryAuthError";
  }
}

export class HoryCacheNotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "HoryCacheNotFoundError";
  }
}

export class HoryValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "HoryValidationError";
  }
}
