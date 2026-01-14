/**
 * Error Middleware - FAZ 5
 * Central error handling with request ID correlation
 */

import { Request, Response, NextFunction } from "express";

const NODE_ENV = process.env.NODE_ENV || "development";

/**
 * Global error handler
 * Catches all errors and formats response
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = (req as any).requestId || "unknown";

  // Log error with correlation ID
  console.error(`❌ Error [${requestId}]:`, {
    message: err.message,
    stack: NODE_ENV === "development" ? err.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  // Generic error response (no stack trace in production)
  const statusCode = err.statusCode || err.status || 500;
  const message =
    NODE_ENV === "production" && statusCode === 500
      ? "Internal server error"
      : err.message || "An error occurred";

  res.status(statusCode).json({
    message,
    requestId, // Include for debugging
    ...(NODE_ENV === "development" && { stack: err.stack }),
  });
}

/**
 * 404 handler for undefined routes
 */
export function notFoundHandler(req: Request, res: Response) {
  const requestId = (req as any).requestId || "unknown";
  
  res.status(404).json({
    message: "Route not found",
    requestId,
  });
}
