import { Request, Response, NextFunction } from "express";

// Mock firebase-admin before importing auth middleware
jest.mock("../config/firebase", () => ({
  auth: {
    verifyIdToken: jest.fn(),
  },
  db: {},
}));

jest.mock("../config/cloudSql", () => ({
  getDb: jest.fn(() => {
    // db("table_name") returns a query builder
    const queryBuilder: any = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null), // No user found = new user
    };
    const dbFn: any = jest.fn().mockReturnValue(queryBuilder);
    return dbFn;
  }),
}));

import { verifyAuth } from "../middleware/auth";
import { auth as firebaseAuth } from "../config/firebase";

function createMockReqRes(headers: Record<string, string> = {}) {
  const req = {
    headers,
  } as unknown as Request;

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;

  const next: NextFunction = jest.fn();

  return { req, res, next };
}

describe("verifyAuth middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const { req, res, next } = createMockReqRes({});

    await verifyAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Missing or invalid Authorization header",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header has wrong format", async () => {
    const { req, res, next } = createMockReqRes({
      authorization: "Basic abc123",
    });

    await verifyAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Missing or invalid Authorization header",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when token is invalid", async () => {
    (firebaseAuth.verifyIdToken as jest.Mock).mockRejectedValue(
      new Error("Invalid token")
    );

    const { req, res, next } = createMockReqRes({
      authorization: "Bearer invalid-token",
    });

    await verifyAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Invalid authentication token",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 with specific message for expired tokens", async () => {
    const expiredError: any = new Error("Token expired");
    expiredError.code = "auth/id-token-expired";
    (firebaseAuth.verifyIdToken as jest.Mock).mockRejectedValue(expiredError);

    const { req, res, next } = createMockReqRes({
      authorization: "Bearer expired-token",
    });

    await verifyAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Token expired. Please re-authenticate.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() and attaches uid for a valid token (new user)", async () => {
    (firebaseAuth.verifyIdToken as jest.Mock).mockResolvedValue({
      uid: "firebase-uid-123",
      phone_number: "+919876543210",
    });

    const { req, res, next } = createMockReqRes({
      authorization: "Bearer valid-token",
    });

    await verifyAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).uid).toBe("firebase-uid-123");
    expect((req as any).phone).toBe("+919876543210");
  });
});
