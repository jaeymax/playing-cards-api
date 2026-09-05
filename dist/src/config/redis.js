"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisConnection = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const redisConfig = {
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null,
};
exports.redisConnection = new ioredis_1.default(redisConfig);
