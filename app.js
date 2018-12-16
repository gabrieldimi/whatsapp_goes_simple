module.exports = (function () {
  const cookieParser = require('cookie-parser')
  const Session = require('express-session')
  const RedisStore = require('connect-redis')(Session)
  return {
        'init': function(express, app, storeClient, logger) {
        app.enable('trust proxy');
        app.set('trust proxy', 1)
        var session = Session({
          store: new RedisStore({client: storeClient}),
          secret: 'mysecret',
          name: 'JSESSIONID',
          resave: true,
          saveUninitialized: true
        })
        /*Making sure that load balancing doesnt interfere with socket.io*/
        app.use(cookieParser())
        app.use(session)

        /**
         * add folders to virtual namespace
         */
        app.use(express.static('icons'));
        app.use(express.static('res'));

        //Enforcing HTTPS, redirects visitor to https if no https has been specified
        app.use (function (req, res, next) {
          if (req.secure || process.env.BLUEMIX_REGION === undefined) {
            next();
          } else {
            logger.log('info', 'redirecting to https');
            res.redirect('https://' + req.headers.host + req.url);
          }
        });


        app.get('/', function(req, res) {
        	logger.log('info', "Client IP: " + req.connection.remoteAddress)
          res.setHeader('Content-Security-Policy', "default-src 'self' *.jquery.com *.socket.io 'unsafe-inline'; media-src 'self' blob:");
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('X-XSS-Protection', '1');
          res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
        	res.sendFile(__dirname + '/index.html');
        });

        app.get('/weblogger', function(req,res) {
        	logger.log('info', "weblogger accessed");
          res.setHeader('Content-Security-Policy', "default-src 'self' *.jquery.com *.socket.io; script-src 'unsafe-inline'; style-src 'unsafe-inline'")
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('X-XSS-Protection', '1');
          res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        	res.sendFile(__dirname + '/weblogger.html')
        });

        app.get('/favicon.gif', (req,res) => {
          res.sendFile(__dirname + '/favicon.gif')
        })
      }
    }
}())
