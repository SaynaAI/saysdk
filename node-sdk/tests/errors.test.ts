import { describe, expect, test } from "bun:test";
import {
  SaynaError,
  SaynaNotConnectedError,
  SaynaNotReadyError,
  SaynaConnectionError,
  SaynaValidationError,
  SaynaServerError,
} from "../src/errors";

describe("SaynaError", () => {
  test("should create error with message", () => {
    const error = new SaynaError("Test error");
    expect(error.message).toBe("Test error");
    expect(error.name).toBe("SaynaError");
  });

  test("should inherit from Error", () => {
    const error = new SaynaError("Test");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("SaynaNotConnectedError", () => {
  test("should have default message", () => {
    const error = new SaynaNotConnectedError();
    expect(error.message).toContain("Not connected");
  });

  test("should accept custom message", () => {
    const error = new SaynaNotConnectedError("Custom connection error");
    expect(error.message).toBe("Custom connection error");
  });

  test("should inherit from SaynaError", () => {
    const error = new SaynaNotConnectedError();
    expect(error).toBeInstanceOf(SaynaError);
  });
});

describe("SaynaNotReadyError", () => {
  test("should have default message", () => {
    const error = new SaynaNotReadyError();
    expect(error.message).toContain("not ready");
  });

  test("should accept custom message", () => {
    const error = new SaynaNotReadyError("Not ready yet");
    expect(error.message).toBe("Not ready yet");
  });

  test("should inherit from SaynaError", () => {
    const error = new SaynaNotReadyError();
    expect(error).toBeInstanceOf(SaynaError);
  });
});

describe("SaynaConnectionError", () => {
  test("should create error without cause", () => {
    const error = new SaynaConnectionError("Connection failed");
    expect(error.message).toBe("Connection failed");
    expect(error.cause).toBeUndefined();
  });

  test("should create error with cause", () => {
    const original = new Error("Original error");
    const error = new SaynaConnectionError("Connection failed", original);
    expect(error.message).toBe("Connection failed");
    expect(error.cause).toBe(original);
  });

  test("should inherit from SaynaError", () => {
    const error = new SaynaConnectionError("test");
    expect(error).toBeInstanceOf(SaynaError);
  });
});

describe("SaynaValidationError", () => {
  test("should create error with message", () => {
    const error = new SaynaValidationError("Invalid parameter");
    expect(error.message).toBe("Invalid parameter");
  });

  test("should inherit from SaynaError", () => {
    const error = new SaynaValidationError("test");
    expect(error).toBeInstanceOf(SaynaError);
  });
});

describe("SaynaServerError", () => {
  test("should create error with message", () => {
    const error = new SaynaServerError("Server error occurred");
    expect(error.message).toBe("Server error occurred");
  });

  test("should inherit from SaynaError", () => {
    const error = new SaynaServerError("test");
    expect(error).toBeInstanceOf(SaynaError);
  });

  test("should create error with status and endpoint", () => {
    const error = new SaynaServerError("Access denied", 403, "livekit/token");
    expect(error.message).toBe("Access denied");
    expect(error.status).toBe(403);
    expect(error.endpoint).toBe("livekit/token");
  });

  test("should have undefined status and endpoint when not provided", () => {
    const error = new SaynaServerError("Server error");
    expect(error.status).toBeUndefined();
    expect(error.endpoint).toBeUndefined();
  });

  test("should create error with 404 status for not accessible", () => {
    const error = new SaynaServerError(
      "Not found or not accessible",
      404,
      "livekit/rooms/my-room"
    );
    expect(error.status).toBe(404);
    expect(error.endpoint).toBe("livekit/rooms/my-room");
  });
});

describe("Error Hierarchy", () => {
  test("all errors should inherit from SaynaError", () => {
    const errors = [
      new SaynaNotConnectedError(),
      new SaynaNotReadyError(),
      new SaynaConnectionError("test"),
      new SaynaValidationError("test"),
      new SaynaServerError("test"),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(SaynaError);
      expect(error).toBeInstanceOf(Error);
    }
  });

  test("should catch all errors with SaynaError", () => {
    const errors = [
      new SaynaNotConnectedError(),
      new SaynaNotReadyError(),
      new SaynaConnectionError("test"),
      new SaynaValidationError("test"),
      new SaynaServerError("test"),
    ];

    for (const error of errors) {
      expect(() => {
        throw error;
      }).toThrow(SaynaError);
    }
  });
});
