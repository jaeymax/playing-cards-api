"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userConnected = userConnected;
exports.userHeartbeat = userHeartbeat;
exports.userDisconnected = userDisconnected;
exports.getUserStatus = getUserStatus;
exports.setUserStatus = setUserStatus;
exports.clearUserStatus = clearUserStatus;
exports.getOnlineUsersWithStatus = getOnlineUsersWithStatus;
exports.getOnlineUserIds = getOnlineUserIds;
exports.getOnlineUserCount = getOnlineUserCount;
const index_1 = require("../index");
const ONLINE_USERS_KEY = "presence:online";
const USERS_STATUS_KEY = "presence:status";
const connectionsKey = (userId) => `presence:user:${userId}:connections`;
const PRESENCE_TTL = 30000;
/**
 * Remove stale socket connections for a user.
 *
 * Connections are stored in a sorted set where the score
 * is the timestamp at which that socket should be considered dead.
 */
function cleanupUserConnections(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const key = connectionsKey(userId);
        yield index_1.redis.zremrangebyscore(key, 0, Date.now());
        return index_1.redis.zcard(key);
    });
}
/**
 * Remove stale users from the global online set.
 *
 * The score in presence:online is the user's last heartbeat.
 */
function cleanupOnlineUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        yield index_1.redis.zremrangebyscore(ONLINE_USERS_KEY, 0, Date.now() - PRESENCE_TTL);
    });
}
function userConnected(userId, socketId) {
    return __awaiter(this, void 0, void 0, function* () {
        const userIdString = String(userId);
        const connections = connectionsKey(userIdString);
        const expiresAt = Date.now() + PRESENCE_TTL;
        /*
        * Remove any dead connections before registering
        * this new one
        */
        yield cleanupUserConnections(userIdString);
        /*
         * Register this socket with an expiration timestamp.
         */
        yield index_1.redis.zadd(connections, expiresAt, socketId);
        /*
        * Update global online presence.
        */
        yield index_1.redis.zadd(ONLINE_USERS_KEY, Date.now(), userIdString);
        //await redis.sadd(key, socketId);
        /*
         * If this is the user's first connection and they don't
         * already have a status, initialize them as idle.
         *
         * We deliberately do NOT overwrite an existing status.
         * This is important when a user reconnects while they
         * still have an active lobby or match.
         */
        const existingStatus = yield index_1.redis.hget(USERS_STATUS_KEY, userIdString);
        if (!existingStatus) {
            yield index_1.redis.hset(USERS_STATUS_KEY, userIdString, "idle");
        }
        return {
            userId: Number(userId),
            online: true,
            status: existingStatus
                ? existingStatus
                : "idle",
        };
    });
}
function userHeartbeat(userId, socketId) {
    return __awaiter(this, void 0, void 0, function* () {
        const userIdString = String(userId);
        const connections = connectionsKey(userIdString);
        const expiresAt = Date.now() + PRESENCE_TTL;
        /*
       * Refresh this socket's expiration.
       */
        yield index_1.redis.zadd(connections, expiresAt, socketId);
        /*
         * Refresh the user's global online timestamp.
         */
        yield index_1.redis.zadd(ONLINE_USERS_KEY, Date.now(), userIdString);
        /*
         * Clean up any other dead sockets for this user.
         */
        yield cleanupUserConnections(userIdString);
    });
}
/**
 * Handle a socket disconnect.
 *
 * Returns true when this was the user's final active connection.
 */
function userDisconnected(userId, socketId) {
    return __awaiter(this, void 0, void 0, function* () {
        const userIdString = String(userId);
        const connections = connectionsKey(userIdString);
        /*
       * Remove this socket immediately.
       */
        yield index_1.redis.zrem(connections, socketId);
        /*
        * Remove any other stale sockets.
        */
        const connectionCount = yield cleanupUserConnections(userIdString);
        /*
       * Another browser tab/device/socket is still alive.
       */
        if (connectionCount > 0) {
            return false;
        }
        /*
         * No active connections remain.
         */
        yield index_1.redis.zrem(ONLINE_USERS_KEY, userIdString);
        /*
         * The connection set is no longer needed.
         */
        yield index_1.redis.del(connections);
        /*
        * Presence status is cleared because the user
        * is now completely offline.
        */
        yield index_1.redis.hdel(USERS_STATUS_KEY, userIdString);
        return true;
    });
}
function getUserStatus(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const status = yield index_1.redis.hget(USERS_STATUS_KEY, String(userId));
        return status || "idle";
    });
}
function setUserStatus(userId, status) {
    return __awaiter(this, void 0, void 0, function* () {
        const userIdString = String(userId);
        const previousStatus = yield getUserStatus(userId);
        /*
         * Avoid unnecessary writes/events.
         */
        if (previousStatus === status) {
            return {
                changed: false,
                previousStatus,
                status,
            };
        }
        yield index_1.redis.hset(USERS_STATUS_KEY, userIdString, status);
        return {
            changed: true,
            previousStatus,
            status,
        };
    });
}
function clearUserStatus(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        return index_1.redis.hdel(USERS_STATUS_KEY, String(userId));
    });
}
function getOnlineUsersWithStatus() {
    return __awaiter(this, void 0, void 0, function* () {
        const userIds = yield getOnlineUserIds();
        if (userIds.length === 0) {
            return [];
        }
        const pipeline = index_1.redis.multi();
        for (const userId of userIds) {
            pipeline.hget(USERS_STATUS_KEY, userId);
        }
        const results = yield pipeline.exec();
        return userIds.map((userId, index) => {
            var _a;
            return ({
                userId,
                status: ((_a = results === null || results === void 0 ? void 0 : results[index]) === null || _a === void 0 ? void 0 : _a[1]) || "idle",
            });
        });
    });
}
function getOnlineUserIds() {
    return __awaiter(this, void 0, void 0, function* () {
        yield cleanupOnlineUsers();
        return index_1.redis.zrange(ONLINE_USERS_KEY, 0, -1);
    });
}
function getOnlineUserCount() {
    return __awaiter(this, void 0, void 0, function* () {
        yield cleanupOnlineUsers();
        return index_1.redis.zcard(ONLINE_USERS_KEY);
    });
}
