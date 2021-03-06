/**
* @name Server
* @author: Julian Leuze
* @author: Gabriel Dimitrov
*/

/**
 * requiring modules
 */
const sha256 = require('sha256');
const request = require('request')
const VisualRecognitionV3 = require('watson-developer-cloud/visual-recognition/v3');
const express = require('express')
const expressApp = express();
const http = require('http').Server(expressApp);
const app = require('./app.js')
const io = require('socket.io')(http);
const ss = require('socket.io-stream');
const logger = require('./log.js')
const redisObject = require('./redisAccess.js')(logger)
const dbAccess = require('./dbAccess.js')(logger)

function addToGlobal() {
  global.adapter = adapter;
  global.gio = io;
  global.redisObject = redisObject;
}

var socketWeblogger = io.of('/weblogger');
logger.init(socketWeblogger);
logger.debugLevel = 'error';
logger.log('info', 'logger running');
logger.log('info', `CF_INSTANCE_INDEX: ${process.env.CF_INSTANCE_INDEX}`)

redisObject.initRedis(io, logger);
addToGlobal();

app.init(express,expressApp,redisObject.getClient(), logger)

/**
 * handle port on ibmcloud and stay compatible for local development
 */
let port = process.env.PORT || 3000;
//synchronously
dbAccess.connectToDB();

//FIXME: not called by any function anymore?
/**
 * this is a beauty function for adding a zero to the minutes of the server time
 * @param {Object} dateObject
 */
function addLeadingZeroToMinutes(dateObject){
	mins = dateObject.getMinutes();
    if(mins < 10){
		mins = '0'+ mins;
	}
	return mins;
}

/**
 *
 * formats incoming messages, adding a timestamp and a date
 * to the message and packing the message in JSON-Object
 * @param {JSON} data
 * @param {String} userOnline
 * @param {Function} callback
 * @param {String} messageID
 */
function sendMessageWithTimestamp (data,userOnline,messageID){
  var messageData = {};
  messageData.userName = userOnline;
  messageData.payload = data.payload;
  var dateObj = new Date();
  var time = dateObj.getHours() + ":" + dateObj.getMinutes();
  logger.log('info', "time: " + time );
  var date = dateObj.getUTCFullYear() + "-" + (dateObj.getUTCMonth() +1) + "-" + dateObj.getDate();
  messageData.time = time;
  messageData.date = date;
  return messageData;
}

/**
 *
 * sends POST request to the tone analyzer service and
 * receives a response if the data evaluates to happiness or sadness
 * this function contains are Promise(), in order that it can be called synchronously with await.
 * @param {JSON} data
 */
function analyzeMood(data) {
	return new Promise(function (resolve, reject) {
	logger.log('info', 'analyzing mood...')
	request({
		headers: {
			'Content-Type': 'application/json'
		},
		uri: 'https://howareu.eu-de.mybluemix.net/tone',
		body: `{ "texts": ["${data.payload}"]}`,
		method: 'POST'
	},
    function (error, response, body) {
        if (!error && response.statusCode == 200) {
			logger.log('info', "MOOD: " + body);
            resolve(body);
        } else {
        reject(error);
      }
    }
);
	});
logger.log('info', 'analyzed mood...')
}

// --------------------SOCKET.IO CALLBACK FUNCTIONS--------------------------

/**
 * Handles the disconnection of a user
 * Deletes the user from the internal user list
 * @param {Boolean} hasRegistrated
 * @param {String} userOnline
 * @param {Object} socket
 */
function handleDisconnect(hasRegistrated, userOnline, socket) {
	if (hasRegistrated) {
		socket.broadcast.emit("userisgone",userOnline);
		// users can now register and then login. Now this is only used for active users
		// delete users[userOnline];
    redisObject.deleteUser(userOnline);
		logger.log('info', userOnline + ' has been deleted from active users. But not from database');
	}
	logger.log('info', `${userOnline} disconnected`);
}

/**
 * Delivers broadcast message to all users who are registered with socket.io
 * data-structure of param data: TODO: data = { }
 * @param {JSON} data
 * @param {Function} callback
 * @param {String} messageID
 * @param {String} userOnline
 * @param {Object} socket
 */
function handleBroadcast(data,messageID, userOnline, socket){
	logger.log('info', messageID)
	logger.log('info', "broadcast: " + userOnline + ": " + data.payload);
	var messageData = sendMessageWithTimestamp (data,userOnline,messageID);
    socket.broadcast.emit(data.emitName, messageData);
}

/**
 * Delivers private message to a specific user, adding the mood of the sender
 * Callback for when whisper is issued data-structure of param data see:
 * @param {JSON} data
 * @param {Function} callback
 * @param {String} messageID
 * @param {String} userOnline
 */
async function handlePrivateMessage(data,callback,messageID, userOnline) {
	messageData = sendMessageWithTimestamp (data,userOnline,messageID)
	logger.log('info', "private message to " + data.id);
	// var toneAnalyzer =  await analyzeMood(data);
	// logger.log('info', "TYPE" + (typeof toneAnalyzer));
	// messageData.mood = JSON.parse(toneAnalyzer).mood;
  messageData.mood = 'happy'
	io.to(data.id).emit('clientPrivateMessage', messageData);
}

/**
 * Sends media files using streams in order not to save files on the server
 * the server works only as a relay, their is no fishy business going on here, sadly NSA is always watching.
 * OMG it's an IIFE
 * @param {Object} incomingStream
 * @param {JSON} data
 * @param {Object} socket
 */
var handleSendingBinary = (function() {
  //Only needed inside function, thus closure
  function sendToSocket(incomingStream, data, idReceiver, userOnline) {
      logger.log('info', 'server pushing to ', idReceiver);
      console.log(idReceiver)
      var outgoingStream = ss.createStream({
        objectMode: true,
        highWaterMark: 16384
      });
      ss(idReceiver).emit('serverPushMediaFile', outgoingStream, data, userOnline);
      incomingStream.pipe(outgoingStream);
  }

  return function(incomingStream, data, socket, idReceiver, userOnline) {
    logger.log('info', data);
    if(idReceiver) {
      logger.log('info','private mediaTransfer to', idReceiver)
      if(!io.sockets.connected[idReceiver]) {
        logger.log('warn', `could not find id ${idReceiver} on this instance!`)
      }
      sendToSocket(incomingStream, data, idReceiver, userOnline)
    } else {
    	for(var i in io.sockets.connected) {
        // don't send the stream back to the initiator
        if (io.sockets.connected[i].id != socket.id) {
          var socketTo = io.sockets.connected[i];
          sendToSocket(incomingStream, data, socketTo)
        }
      }
    }
  }
}())

/**
 * This function will trigger a marked message in the private room of the
 * recipient whenever a file has been uploaded TODO: param
 * @param {JSON} data
 * @param {String} filename
 */
function handlePrivateUpload(data, filename) {
	logger.log('info', 'server uploadnotice')
	io.to(data.id).emit('clientPrivateUpload', {"userName": userOnline, 'filename': filename})
}

/**
 * This function will trigger a marked message in the global room whenever a
 * file has been uploaded TODO: param
 * @param {String} filename
 * @param {Object} socket
 * @param {String} userOnline
 */
function handleUpload(filename, socket, userOnline) {
	logger.log('info', 'server uploadnotice')
	socket.broadcast.emit('clientUpload', {"userName": userOnline, 'filename': filename})
}

/**
 * Sends the received message to all connected sockets. On the client this
 * message will be displayed in the 'Global' tab. param msg the message from the
 * client socket to be broadcast
 * @param {String} msg
 */
function handleChatMessage(msg) {
	logger.log('info', 'message: ' + msg);
	io.emit('chat message', userOnline + ": " + msg);
}
//regular expression to make sure usernames may only contain word-characters and Whitspaces
//and a name cannot be: 'Global'
var re = /(?!^Global$)^\w[ \w]*(?<=\w)$/
var rePassword = /^(?:(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*\W)).{8,}$/

/**
 *  handling the registration of a user
 *  the user will be warned if the following rules are broken:
 *  1. the user name has to be longer then 0 characters
 *  2. the user name has to be unique
 *  3. user name must match the pattern
 *  @param {String} name
 *  @param {JSON} userInfo
 *  @param {Object} socket
 */
async function handleRegistration(imageStream,registrationData, userInfo, socket) {
	var answer = {};
	var name = registrationData.userName;

	// logger.log("info",`password plain text = ${registrationData.password}`);
  //Rather check here insetead of nesting if-statements
  if(!rePassword.test(registrationData.password)) {
    answer.success = false;
    answer.msg = `Password must contain at least
                  one uppercase,
                  one lowercase,
                  one digit and
                  one special character.
                  The password must be at least 8 characters long`;
    logger.log('warn', 'Server pattern checking: password did not match pattern')
  } else{

		var passwordHash = sha256(registrationData.password);
		logger.log("warn",`passwordHash by registration = '${passwordHash}'`);
	 	var userIsAHuman = await couldThisBeHuman(imageStream,registrationData.fileSize);
		logger.log("warn",userIsAHuman);


		logger.log('info', name + " tried to register")
		//logger.log('info', users)
		logger.log('info', `face recognition: ${userIsAHuman.images[0].faces}`);
		if(userIsAHuman.images[0].faces.length >= 1){

			if(re.test(name)) {

				var queryResult = await dbAccess.doesUserExist(name);
				//checking if user exists and if it is right user
				if (!queryResult) {
					logger.log('info', name + ' is registered');
					var additionResult = dbAccess.addUserToDB(name,passwordHash);
					logger.log("info", "result of adding user:",additionResult);
					await informUsers(name,answer,userInfo,socket);
					answer.msg = `Welcome ${name}`;
				} else {
					logger.log('info', 'user name: ' + name + ' already exists');
					answer.success = false;
					answer.msg = name + " already exists";
				}

			} else {
				logger.log('info', 'user name: '+ name + ' doesn\'t match pattern');
				answer.success = false;
				answer.msg = name + " doesnt't match the pattern: at least one character, and may not end or start with whitspace";
			}
		}else{
			logger.log('warn', `user with name ${name} is not a human`);
			answer.success = false;
			answer.msg = name + " isn't a human, please listen to your owner. You are robot. All your base are belong to us!";
		}
	}
	socket.emit('registrationStatus', answer);
}

/**
 * Handles the login of a user, if he is already registered and knows his password.
 * A broadcast is send then to all users that he is online.
 * @param {*} loginData
 * @param {*} userInfo
 * @param {*} socket
 */
async function handleLogin(loginData, userInfo, socket){
	var answer ={};
	var name = loginData.userName;
	var passwordHash = sha256(loginData.password);
	// logger.log("info",`password plain text = ${loginData.password}`);
	logger.log("warn",`passwordHash by login= '${passwordHash}'`);
	var queryResult = await dbAccess.doUserCredentialsFit(name,passwordHash);
  var exists = await redisObject.exists(name);
	if(!exists){
		if(queryResult){
			logger.log('info',`user ${queryResult.USERID} knows his password`);
			await informUsers(queryResult.USERID,answer,userInfo,socket);
			answer.msg = `Welcome back, ${queryResult.USERID}`;
		}else{
			logger.log('info',"either user name or password doesn't match");
			answer.success = false;
			answer.msg = "Either user name or password doesn't match!";
		}

	}else{
		logger.log('info',"user is already logged in");
		answer.success = false;
		answer.msg = "You are already logged in.";
	}

	socket.emit('loginStatus',answer);
}


/* handling socket.io processes, which includes event management, callbacks and message transfer */
io.on('connection', function(socket) {
	logger.log('info', 'a user connected');
	var userInfo = {
			userOnline: null,
			hasRegistrated: null
	}
	//See SOCKET.IO CALLBACK FUNCTIONS Comment
	ss(socket).on("registration", (imageStream,registrationData) => handleRegistration(imageStream,registrationData, userInfo, socket));
	socket.on('login', (loginData) => handleLogin(loginData,userInfo,socket));
	socket.on('chat message', (msg) => handleChatMessage(msg));
	socket.on('disconnect', () => handleDisconnect(userInfo.hasRegistrated, userInfo.userOnline, socket));
	socket.on('broadcast', function(data,messageID, cb) {
    handleBroadcast(data,messageID, userInfo.userOnline, socket)
    var dateObj = new Date();
    var time = dateObj.getHours() + ":" + dateObj.getMinutes();
    var date = dateObj.getUTCFullYear() + "-" + (dateObj.getUTCMonth() +1) + "-" + dateObj.getDate();
    cb(date,time)
  });
	socket.on('privatemessage', (data,callback,messageID) => handlePrivateMessage(data,callback,messageID, userInfo.userOnline));
	socket.on('privateUpload', (data, filename) => handlePrivateUpload(data, filename))
	socket.on('upload', (filename) => handleUpload(filename, socket, userInfo.userOnline))
	ss(socket).on('sendingbinary', (incomingStream, data, idReceiver) => handleSendingBinary(incomingStream, data,socket, idReceiver, userInfo.userOnline));
  socket.emit('instance', process.env.CF_INSTANCE_INDEX)
});


/**
 * Uses visual recognition service to detect if a image is truely matches a human face
 * @param {*} imageStream
 */
 function couldThisBeHuman(imageStream, size){
 	return new Promise(function (resolve, reject) {
 		var visualRecognition = new VisualRecognitionV3({
 			version: '2018-03-19',
 			iam_apikey: 'npDYkj5gmFajccbJR8CQ1C2MGLPRpgjZdxsE9vkJoK8Z'
 		});

     var binary = new Uint8Array(size);
     var chunkBuffer = []
     imageStream.on('data', function(chunk) {
         chunkBuffer.push(chunk);
     })
     k = 0;
     imageStream.on('end', function() {
       for(var i = 0; i < chunkBuffer.length; i++) {
         for(var j = 0; j < chunkBuffer[i].length; j++) {
           binary[k] = chunkBuffer[i][j];
           k++;
         }
       }
       console.log(k == size, k, size)
       console.log(sha256(binary));

       buf = Buffer.allocUnsafe(size);
       for(var i = 0; i < size; i++) {
         buf[i] = binary[i];
       }
           console.log(sha256(buf));
           var params = {
             images_file : buf,
             //TODO: remove static values
             images_filename: 'profilePic.png',
             images_file_content_type: 'image/png'
           };

           visualRecognition.detectFaces(params, function(err, response) {
             logger.log("info","testing picture for facial recognition");
             if (err) {
             logger.log('warn', err);
             reject(err);
             } else {
               console.log('no error')
               logger.log('info', JSON.stringify(response, null, 2))
               resolve(response);
             }
           });
     })
 	});
 }
/**
 * Sends a broadcast with user info to all online users to inform them that @name is online
 * @param {String} name
 * @param {JSON} answer
 * @param {JSON} userInfo
 * @param {OBJECT} socket
 */
async function informUsers(name, answer,userInfo,socket) {
	// var pair = {};
	// users[name] = pair;
	// pair.connection = socket.id;
  redisObject.addUser(name, socket.id);
	userInfo.userOnline = name;
	userInfo.hasRegistrated = true;
  var all = await redisObject.getAll();
  console.log(`ALL users from redis ${all}`);
	answer.users = JSON.parse(all);
	answer.success = true;
	answer.selfName = name;
	var newUser = {};
	newUser.socketid = socket.id;
	newUser.name = name;
	socket.broadcast.emit('newuser',newUser);
}

// Starting the server on specific port
http.listen(port, function() {
	logger.log('info', 'listening on *:' + port);
});

;['SIGTERM', 'SIGINT'].forEach(eventName => {
  process.on(eventName, () => {
    logger.log('info', `${eventName} signal received.`);
    process.exit(0);
  });
})
