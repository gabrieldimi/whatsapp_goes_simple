/**
* @name Server
* @author: Julian Leuze
* @author: Gabriel Dimitrov
*/

/**
 * requiring modules
 */
var fs = require("fs");
var stream = require('stream');
var sha256 = require('sha256');
var request = require('request')
var VisualRecognitionV3 = require('watson-developer-cloud/visual-recognition/v3');
var ibmdb = require('ibm_db');
const express = require('express')
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const ss = require('socket.io-stream');
const logger = require('./log.js')

logger.debugLevel = 'warn';
logger.log('info', 'logger test');



/**
 * add folders to virtual namespace
 */
app.use(express.static('icons'));
app.use(express.static('res'));

app.enable('trust proxy');
//Enforcing HTTPS, redirects visitor to https if no https has been specified
app.use (function (req, res, next) {
  if (req.secure || process.env.BLUEMIX_REGION === undefined) {
    next();
  } else {
    logger.log('info', 'redirecting to https');
    res.redirect('https://' + req.headers.host + req.url);
  }
});

/**
 * handle port on ibmcloud and stay compatible for local development
 */
let port = process.env.PORT || 3000;
/**
 * key-value user database to keep track of active users
 */
var users = {};
var databaseConnection;
callConnectionToDatabase();


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
function sendMessageWithTimestamp (data,userOnline,callback,messageID){
  var messageData = {};
  messageData.userName = userOnline;
  messageData.payload = data.payload;
  var dateObj = new Date();
  var time = dateObj.getHours() + ":" + dateObj.getMinutes();
  logger.log('info', "time: " + time );
  var date = dateObj.getUTCFullYear() + "-" + (dateObj.getUTCMonth() +1) + "-" + dateObj.getDate();
  messageData.time = time;
  messageData.date = date;
  // callback({"time": time, "date": date},messageID) TODO: figure out why not
  // working or remove
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
		// users can now register and then login
		// delete users[userOnline];
		//logger.log('info', userOnline + 'has been deleted');
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
function handleBroadcast(data, callback,messageID, userOnline, socket){
	logger.log('info', callback);
	logger.log('info', messageID)
	logger.log('info', "broadcast: " + userOnline + ": " + data.payload);
	var messageData = sendMessageWithTimestamp (data,userOnline,callback,messageID);
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
	logger.log('info', 'callback: ' + callback)
	messageData = sendMessageWithTimestamp (data,userOnline,callback,messageID)
	logger.log('info', "private message to " + data.id);
	var toneAnalyzer =  await analyzeMood(data);
	logger.log('info', "TYPE" + (typeof toneAnalyzer));
	messageData.mood = JSON.parse(toneAnalyzer).mood;
	io.to(data.id).emit('clientPrivateMessage', messageData);
}

/**
 * Sends media files using streams in order not to save files on the server
 * the server works only as a relay, their is no fishy business going on here, sadly NSA is always watching
 * @param {Object} incomingStream
 * @param {JSON} data
 * @param {Object} socket
 */
function handleSendingBinary(incomingStream, data,socket) {
	logger.log('info', data);
	for(var i in io.sockets.connected) {
	      // don't send the stream back to the initiator
	      if (io.sockets.connected[i].id != socket.id)
	      {
	        var socketTo = io.sockets.connected[i];
	        logger.log('info', 'server pushing to ' + socketTo.id);
	        var outgoingStream = ss.createStream();
	        ss(socketTo).emit('serverPushMediaFile', outgoingStream, data);
	        incomingStream.pipe(outgoingStream);
	      }
	    }
}

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

var re = /^\w[ \w]*(?<=\w)$/
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
	var passwordHash = sha256(registrationData.password);

	// for testing
	// var test =fs.createWriteStream('./icons/test.png');
	// imageStream.pipe(test);
	var userIsAHuman = await couldThisBeHuman(imageStream,registrationData.fileSize);
	logger.log("warn",userIsAHuman);


	logger.log('info', name + " tried to register")
	//logger.log('info', users)
    logger.log('info', `face recognition: ${userIsAHuman.images[0].faces}`);
	if(userIsAHuman.images[0].faces.length >= 1){

		if(re.test(name)) {

			/*
			* TODO: Name Global needs to be forbidden, too
			*/
			var queryResult = await doesUserExist(name);
			//checking if user exists and if it is right user
			if (!queryResult) {
				logger.log('info', name + ' is registered');
				var additionResult = addUserToDB(name,passwordHash);
				logger.log("info", "result of adding user:",additionResult);
				informUsers(name,answer,userInfo,socket);
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
	var name = registrationData.userName;
	var passwordHash = sha256(registrationData.password);
	var queryResult = await doUserCredentialsFit(name,passwordHash);
	if(queryResult){
		logger.log('info',`user ${queryResult.USERID} knows his password`);
		informUsers(queryResult.USERID,answer,userInfo,socket);
		answer.msg = `Welcome back, ${queryResult.USERID}`;
	}else{
		logger.log('info',"either user name or password doesn't match");
		answer.success = false;
		answer.msg = "Either user name or password doesn't match!";
	}

	socket.emit('loginStatus',answer);
}

app.get('/', function(req, res) {
	logger.log('info', "Client IP: " + req.connection.remoteAddress)
	res.sendFile(__dirname + '/index.html');
});

app.get('/weblogger', function(req,res) {
	logger.log('info', "weblogger accessed");
	res.sendFile(__dirname + '/weblogger.html')
});

var socketWeblogger = io.of('/weblogger');
socketWeblogger.on('connection',function(socket) {
	logger.log('info', 'weblogger listening')
});
logger.socket = socketWeblogger;


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
	socket.on('broadcast', (data, callback,messageID) => handleBroadcast(data, callback,messageID, userInfo.userOnline, socket));
	socket.on('privatemessage', (data,callback,messageID) => handlePrivateMessage(data,callback,messageID, userInfo.userOnline));
	socket.on('privateUpload', (data, filename) => handlePrivateUpload(data, filename))
	socket.on('upload', (filename) => handleUpload(filename, socket, userInfo.userOnline))
	ss(socket).on('sendingbinary', (incomingStream, data) => handleSendingBinary(incomingStream, data,socket));

});

/**
 * Handles connection of server to ibm database, uses a promise in order that this function runs asynchronously.
 * Connection is opened via credentials found in DBcredentials.json
 */
function connectToDB(){
	return new Promise(function (resolve, reject) {
		logger.log('info', "Accessing the ibm database");

		/*Connect to the database server
		param 1: The DSN string which has the details of database name to connect to, user id, password, hostname, portnumber
		param 2: The Callback function to execute when connection attempt to the specified database is completed
		*/
		var credentialsUnparsed = fs.readFileSync("DBcredentials.json");
		var credentialsParsed = JSON.parse(credentialsUnparsed);
		ibmdb.open("DRIVER={DB2};DATABASE="+credentialsParsed.db+";UID="+credentialsParsed.username+";PWD="+credentialsParsed.password+";HOSTNAME="+credentialsParsed.hostname+";port="+credentialsParsed.port, function(err, conn)
		{
				if(err) {
					/*
					On error in connection, log the error message on console
					*/
					console.error("error: ", err.message);
					reject(err);
				} else {
					logger.log('info', `Database connection is made`,conn);
					resolve(conn);
					// conn.close(function(){
					// 	logger.log('info', "Connection Closed");
					// });
			}
		});
	});
}

/**
 * Is used to call a function to connect to the ibm database
 */
async function callConnectionToDatabase(){
	databaseConnection = await connectToDB();
}

/**
 * Checks if the user with a specific name is already saved in the database
 * @param {String} userName
 */
function doesUserExist(userName){
	return new Promise(function (resolve, reject) {
		databaseConnection.query(`select userid from Users where USERID='${userName}'`, function(err,result, moreresults){
			logger.log("info", "callback of search user");
			if(err){
				logger.log('error', err);
				reject(err);
			}else{
				logger.log('info', `does user exist ${result[0]}`);
				logger.log('info', `more results: ${moreresults}`);
				resolve(result[0]);
			}
		});
	});

}
/**
 * Handles adding users with name and password to the database, using a query request
 * @param {String} userName
 * @param {String} passwordHash
 */
function addUserToDB(userName,passwordHash){
	return new Promise(function (resolve, reject) {
		databaseConnection.query(`insert into Users values('${userName}','${passwordHash}');`,function(err,result){
			logger.log("info", "callback of add user");
			if(err){
				logger.log('error', err);
				reject(err);
			}else{
				logger.log('info', `adding user: ${userName}`);
				resolve(result);
			}
		});
	});
}
/**
 * Checks database for a specific user with corresponding password.
 * @param {*} userName
 * @param {*} passwordHash
 */
function doUserCredentialsFit(userName,passwordHash){
	return new Promise(function (resolve, reject) {
		databaseConnection.query(`select userid, passwd from Users where userid = '${userName}' and passwd = '${passwordHash}';`,function(err,result,moreresults){
			logger.log("info", "callback of searching for a user with specific password");
			if(err){
				logger.log('error', err);
				reject(err);
			}else{
				logger.log('info', `${userName} with corresponding password exists.`);
				resolve(result[0]);
			}
		});
	});
}
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
             images_filename: 'profilePic.png',
             images_file_content_type: 'image/png'
           };

           visualRecognition.detectFaces(params, function(err, response) {
             logger.log("info","testing");
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
function informUsers(name, answer,userInfo,socket){
	var pair = {};
	users[name] = pair;
	pair.connection = socket.id;
	userInfo.userOnline = name;
	answer.users = users;
	userInfo.hasRegistrated = true;
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
