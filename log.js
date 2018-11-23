  var logger = exports;
  logger.debugLevel = 'warn';
  logger.socket;
  logger.log = function(level, message) {
    var levels = ['error', 'warn', 'info'];
    if (levels.indexOf(level) >= levels.indexOf(logger.debugLevel) ) {
      if (typeof message !== 'string') {
        message = JSON.stringify(message);
      };
      console.log(level+': '+message);
      if(logger.socket) {
        logger.socket.emit('log', level+': '+message);
      }
    }
  }