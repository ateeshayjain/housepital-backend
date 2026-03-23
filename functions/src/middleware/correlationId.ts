import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

/**
 * Middleware: attach a unique correlation ID to every request.
 * The ID is set on both the request object and the response header
 * so it can be traced through logs and returned to the client.
 */
export function correlationId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const id =
    (req.headers["x-correlation-id"] as string) || uuidv4();
  (req as any).correlationId = id;
  res.setHeader("x-correlation-id", id);
  next();
}
