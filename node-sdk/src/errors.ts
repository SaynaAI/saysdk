/**
 * Base error class for all Sayna SDK errors.
 */
export class SaynaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaynaError";
    Object.setPrototypeOf(this, SaynaError.prototype);
  }
}

/**
 * Error thrown when attempting to use the client before it's connected.
 */
export class SaynaNotConnectedError extends SaynaError {
  constructor(message: string = "Not connected to Sayna WebSocket") {
    super(message);
    this.name = "SaynaNotConnectedError";
    Object.setPrototypeOf(this, SaynaNotConnectedError.prototype);
  }
}

/**
 * Error thrown when attempting operations before the client is ready.
 */
export class SaynaNotReadyError extends SaynaError {
  constructor(
    message: string = "Sayna voice providers are not ready. Wait for the connection to be established."
  ) {
    super(message);
    this.name = "SaynaNotReadyError";
    Object.setPrototypeOf(this, SaynaNotReadyError.prototype);
  }
}

/**
 * Error thrown when WebSocket connection fails.
 */
export class SaynaConnectionError extends SaynaError {
  public override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "SaynaConnectionError";
    this.cause = cause;
    Object.setPrototypeOf(this, SaynaConnectionError.prototype);
  }
}

/**
 * Error thrown when invalid parameters are provided.
 */
export class SaynaValidationError extends SaynaError {
  constructor(message: string) {
    super(message);
    this.name = "SaynaValidationError";
    Object.setPrototypeOf(this, SaynaValidationError.prototype);
  }
}

/**
 * Error thrown when the server returns an error.
 */
export class SaynaServerError extends SaynaError {
  constructor(message: string) {
    super(message);
    this.name = "SaynaServerError";
    Object.setPrototypeOf(this, SaynaServerError.prototype);
  }
}
