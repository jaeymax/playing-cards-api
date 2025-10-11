"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const errorHandler = (err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    const message = err.message || "Internal Server Error";
    res.status(statusCode).json({
        message,
        stack: process.env.NODE_ENV === "production" ? "🥞" : err.stack,
    });
    next();
};
exports.default = errorHandler;
