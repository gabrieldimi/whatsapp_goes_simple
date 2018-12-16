module.exports = (function() {
  const fs = require('fs');
  const redis = require("redis");
  const cfenv = require('cfenv');
  const socketIoRedis = require('socket.io-redis');
  var vcapLocal;
  try {
  vcap = fs.readFileSync("vcaplocal.json");
  vcapLocal = JSON.parse(vcap)
  console.log("Loaded local VCAP");
  } catch (e) {
    // console.log(e)
  }

  var pub,sub,client;
  var hashset = 'users';

  return {
    'initRedis': function(io) {
      //TODO: logger
      console.log('INIT OF REDIS');
      let services;
      let redis_services;
      if(vcapLocal) {
        redis_services = vcapLocal["compose-for-redis"]
      } else {
      const appEnv = cfenv.getAppEnv(process.env.VCAP_SERVICES);
      services = appEnv.services;
      redis_services = services["compose-for-redis"];
      }
      let credentials = redis_services[0].credentials;
      let connectionString = credentials.uri;

      let redisParams = {
        tls: { servername: new URL(connectionString).hostname },
        retry_strategy: function(options) {
          if(options.error.code === 'ECONNRESET') {
            console.log('DO NOT THROW')
          }
        }
      }

      pub = redis.createClient(connectionString, redisParams);
      sub = redis.createClient(connectionString, redisParams);
      global.client = client = redis.createClient(connectionString, redisParams);

      pub.on("error", function (err) {
        console.log("Error " + err);
        logger.log('info', 'reconnecting pub')
      });

      sub.on("error", function (err) {
        console.log("Error " + err);
        logger.log('info', 'reconnecting sub')
      });

      client.on("error", function (err) {
        console.log("Error " + err);
        logger.log('info', 'reconnecting client')
      });

      adapter = io.adapter(socketIoRedis({pubClient: pub, subClient: sub }));
    },
    'addUser': function(name, value) {
      ret = client.hset(hashset, name, value);
      console.log(`adding user ${name} to redis. ret ${ret}`)
      if(!client || !ret) {
        console.error("could not set key due to error or redis client being undefined")
      }
    },
    'deleteUser': function(name) {
      client.hdel(hashset, name)
    },
    'exists': function(name) {
      return new Promise(function(resolve, reject) {
        ret = client.hget(hashset, name, function(err,reply) {
          console.log(`redis_reply for key ${name}: ${reply}`);
          resolve(reply !== null)
        });
        console.log(`ret ${ret}`)
      });
    },
    'getAll': function() {
      return new Promise(function(resolve, reject) {
        client.hgetall(hashset, (err, jsonReply) => {
          console.log(`all users from redis ${JSON.stringify(jsonReply)}`)
          resolve(JSON.stringify(jsonReply))
        })
      })
    },
    'getClient': function() {
      return client;
    }
  }
}())
