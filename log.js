  var logger = exports;
  logger.debugLevel = 'warn';
  logger.socket;

  logger.init = function(socketWeblogger) {
    logger.socket = socketWeblogger;
    socketWeblogger.on('connection',function(socket) {
    	logger.log('info', 'weblogger listening')
      socket.on('cpu', () => {
        socketWeblogger.to(socket.id).emit('cpu_answer', process.cpuUsage());
      })

      socket.on('memory', () => {
        socketWeblogger.to(socket.id).emit('memory_answer', process.memoryUsage());
      })

      socket.on('uptime', () => {
        socketWeblogger.to(socket.id).emit('uptime_answer', process.uptime());
      })

      socket.on('logAllOut', () => redisObject.logAllOut())
    });
  }


  logger.log = function(level, ...messages) {
    var levels = ['error', 'warn', 'info'];
    if (levels.indexOf(level) >= levels.indexOf(logger.debugLevel) ) {
      for(message of messages) {
        if (typeof message !== 'string') {
          message = JSON.stringify(message);
        };
        console.log(level+': '+message);
        if(logger.socket) {
          logger.socket.emit('log', level, message);
        }
      }
    }
  }

  logger.info = function(...messages) {
    logger.log('info', ...messages)
  }

  logger.warn = function(...messages) {
    logger.log('warn', ...messages)
  }

  logger.error = function(...messages) {
    logger.log('error', ...messages)
  }
