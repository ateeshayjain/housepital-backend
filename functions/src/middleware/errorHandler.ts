import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

/**
 * Centralized error handler for Express.
 * Catches unhandled errors and returns consistent JSON responses.
 */
export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
}

/**
 * Custom error class with status code.
 */
export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = "AppError";
  }
}
