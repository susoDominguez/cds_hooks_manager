import logger from "../../../config/winston.js";
import { ErrorHandler } from "../../../lib/errorHandler.js";
import { createClient } from "redis";
const { REDIS_HOST, REDIS_PORT } = process.env;


let redisClient;

(async () => {
  redisClient = createClient({ url: `redis://${REDIS_HOST || '127.0.0.1'}:${REDIS_PORT || '6379'}` });
/*
(async () => {
  redisClient = createClient({
    host: REDIS_HOST || '127.0.0.1'
    ,port: REDIS_PORT || '6379'
   // ,detect_buffers: true
});
*/
  redisClient.on("ready", () => logger.debug('redis server is ready'))
   
  redisClient.on("connect", () => logger.debug('connect redis: success'))

  redisClient.on("error", (err) => logger.error(`${err}`) );

  await redisClient.connect();
})();

export default redisClient;