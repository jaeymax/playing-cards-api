import { Request, Response, NextFunction } from "express";
import { AxiosError } from "axios";

interface HttpError extends AxiosError {
  status?: number;
  data?: any;
}

const errorHandler = (
  err: HttpError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  const message = err.message || err.data.message || "Internal Server Error";

  console.error('err', err);

  res.status(statusCode).json({
    message,
    stack: process.env.NODE_ENV === "production" ? "🥞" : err.stack,
  });

  next();
};

export default errorHandler;
