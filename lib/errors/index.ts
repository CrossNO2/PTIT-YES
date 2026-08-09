import { NextResponse } from "next/server";

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, code = "INTERNAL_SERVER_ERROR", statusCode = 500, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function formatErrorResponse(error: unknown): { status: number; body: ApiErrorResponse } {
  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
    };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      body: {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "An unexpected error occurred",
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "UNKNOWN_ERROR",
        message: "An unknown error occurred",
      },
    },
  };
}

export function jsonError(message: string, code = "BAD_REQUEST", statusCode = 400, details?: unknown): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status: statusCode }
  );
}
