"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const notFoundMiddleware = (req, res, next) => {
    res.status(404).json({ message: 'Resource not found' });
    next();
};
exports.default = notFoundMiddleware;
