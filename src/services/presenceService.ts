import {redis} from "../index";

export type PlayerStatus =
  | "idle"
  | "looking_for_game"
  | "in_lobby"
  | "in_match";

const ONLINE_USERS_KEY = "presence:online";
const USERS_STATUS_KEY = "presence:status"

const connectionsKey = (userId: number | string) =>
  `presence:user:${userId}:connections`;


const PRESENCE_TTL = 30_000;


/**
 * Remove stale socket connections for a user.
 *
 * Connections are stored in a sorted set where the score
 * is the timestamp at which that socket should be considered dead.
 */
async function cleanupUserConnections(
  userId: number | string
) {
  const key = connectionsKey(userId);

  await redis.zremrangebyscore(
    key,
    0,
    Date.now()
  );

  return redis.zcard(key);
}

/**
 * Remove stale users from the global online set.
 *
 * The score in presence:online is the user's last heartbeat.
 */
async function cleanupOnlineUsers() {
  await redis.zremrangebyscore(
    ONLINE_USERS_KEY,
    0,
    Date.now() - PRESENCE_TTL
  );
}


export async function userConnected(
  userId: number | string,
  socketId: string
) {

  const userIdString = String(userId);
  const connections = connectionsKey(userIdString);
  const expiresAt = Date.now() + PRESENCE_TTL;


   /*
   * Remove any dead connections before registering
   * this new one
   */
  await cleanupUserConnections(userIdString);

  /*
   * Register this socket with an expiration timestamp.
   */
  await redis.zadd(
    connections,
    expiresAt,
    socketId
  );

   /*
   * Update global online presence.
   */
  await redis.zadd(
    ONLINE_USERS_KEY,
    Date.now(),
    userIdString
  );


  //await redis.sadd(key, socketId);


  /*
   * If this is the user's first connection and they don't
   * already have a status, initialize them as idle.
   *
   * We deliberately do NOT overwrite an existing status.
   * This is important when a user reconnects while they
   * still have an active lobby or match.
   */
  const existingStatus = await redis.hget(
    USERS_STATUS_KEY,
    userIdString
  );

  if (!existingStatus) {
    await redis.hset(
      USERS_STATUS_KEY,
      userIdString,
      "idle"
    );
  }

  return {
    userId: Number(userId),
    online:true,
    status: existingStatus
      ? (existingStatus as PlayerStatus)
      : "idle",
  };
}

export async function userHeartbeat(
  userId: number | string, socketId:string
) {

  const userIdString = String(userId);
  const connections = connectionsKey(userIdString);

  const expiresAt = Date.now() + PRESENCE_TTL;

    /*
   * Refresh this socket's expiration.
   */
  await redis.zadd(
    connections,
    expiresAt,
    socketId
  );

  /*
   * Refresh the user's global online timestamp.
   */
  await redis.zadd(
    ONLINE_USERS_KEY,
    Date.now(),
    userIdString
  );

  /*
   * Clean up any other dead sockets for this user.
   */
  await cleanupUserConnections(userIdString);
}

/**
 * Handle a socket disconnect.
 *
 * Returns true when this was the user's final active connection.
 */
export async function userDisconnected(
  userId: number | string,
  socketId: string
) {

  const userIdString = String(userId);
  const connections = connectionsKey(userIdString);

    /*
   * Remove this socket immediately.
   */
  await redis.zrem(
    connections,
    socketId
  );

   /*
   * Remove any other stale sockets.
   */
  const connectionCount =
    await cleanupUserConnections(userIdString);

    /*
   * Another browser tab/device/socket is still alive.
   */
  if (connectionCount > 0) {
    return false;
  }

  /*
   * No active connections remain.
   */
  await redis.zrem(
    ONLINE_USERS_KEY,
    userIdString
  );

  /*
   * The connection set is no longer needed.
   */
  await redis.del(connections);

  

   /*
   * Presence status is cleared because the user
   * is now completely offline.
   */
  await redis.hdel(
    USERS_STATUS_KEY,
    userIdString
  );

  return true;
}

export async function getUserStatus(
  userId: number | string
): Promise<PlayerStatus> {
  const status = await redis.hget(
    USERS_STATUS_KEY,
    String(userId)
  );

  return (status as PlayerStatus) || "idle";
}

export async function setUserStatus(
  userId: number | string,
  status: PlayerStatus
) {
  const userIdString = String(userId);

  const previousStatus = await getUserStatus(userId);

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

  await redis.hset(
    USERS_STATUS_KEY,
    userIdString,
    status
  );

  return {
    changed: true,
    previousStatus,
    status,
  };
}

export async function clearUserStatus(
  userId: number | string
) {
  return redis.hdel(
    USERS_STATUS_KEY,
    String(userId)
  );
}

export async function getOnlineUsersWithStatus() {
  const userIds = await getOnlineUserIds();

  if (userIds.length === 0) {
    return [];
  }

  const pipeline = redis.multi();

  for (const userId of userIds) {
    pipeline.hget(
      USERS_STATUS_KEY,
      userId
    );
  }

  const results = await pipeline.exec();

  return userIds.map((userId, index) => ({
    userId,
    status:
      (results?.[index]?.[1] as PlayerStatus) || "idle",
  }));
}

export async function getOnlineUserIds() {
  await cleanupOnlineUsers();

  return redis.zrange(
    ONLINE_USERS_KEY,
    0,
    -1
  );
}

export async function getOnlineUserCount() {
  await cleanupOnlineUsers();

  return redis.zcard(ONLINE_USERS_KEY);
}