"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const errorHandler = (err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    const message = err.message || err.data.message || "Internal Server Error";
    console.error('err', err);
    res.status(statusCode).json({
        message,
        stack: process.env.NODE_ENV === "production" ? "🥞" : err.stack,
    });
    next();
};
exports.default = errorHandler;
