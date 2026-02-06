import Redis from 'ioredis';

const redisConfig = {
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: null,
};


export const redisConnection = new Redis(redisConfig);