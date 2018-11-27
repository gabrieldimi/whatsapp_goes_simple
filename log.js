  var logger = exports;
  logger.debugLevel = 'warn';
  logger.socket;
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
