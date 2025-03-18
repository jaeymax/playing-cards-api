import { Request, Response, NextFunction } from "express";

interface HttpError extends Error {
  status?: number;
}

const errorHandler = (
  err: HttpError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    message,
    stack: process.env.NODE_ENV === "production" ? "🥞" : err.stack,
  });

  next();
};

export default errorHandler;
