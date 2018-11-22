/**
* @name Server
* @author: Julian Leuze
* @author: Gabriel Dimitrov
*/

var fs = require("fs");
const express = require('express')
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const ss = require('socket.io-stream');
var request = require('request')

/*require the ibm_db module*/
var ibmdb = require('ibm_db');

/**
 * add folders to virtual namespace
 */
app.use(express.static('icons'));
app.use(express.static('res'));

/**
 * handle port on ibmcloud and stay compatible for local development
 */
let port = process.env.PORT || 3000;
/**
 * key-value user database to keep track of active users
 */
var users = {};
var databaseConnection;


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
  console.log("time: " + time );
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
	console.log('analyzing mood...')
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
			console.log("MOOD: " + body);
            resolve(body);
        } else {
        reject(error);
      }
    }
);
	});
console.log('analyzed mood...')
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
		delete users[userOnline];
		console.log(userOnline + 'has been deleted');
	}
	console.log('user disconnected');
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
	console.log(callback);
	console.log(messageID)
	console.log("broadcast: " + userOnline + ": " + data.payload);
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
	console.log('callback: ' + callback)
	messageData = sendMessageWithTimestamp (data,userOnline,callback,messageID)
	console.log("private message to " + data.id);
	var toneAnalyzer =  await analyzeMood(data);
	console.log("TYPE" + (typeof toneAnalyzer));
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
	console.log(data);
	for(var i in io.sockets.connected) {
	      // don't send the stream back to the initiator
	      if (io.sockets.connected[i].id != socket.id)
	      {
	        var socketTo = io.sockets.connected[i];
	        console.log('server pushing to ' + socketTo.id);
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
	console.log('server uploadnotice')
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
	console.log('server uploadnotice')
	socket.broadcast.emit('clientUpload', {"userName": userOnline, 'filename': filename})
}

/**
 * Sends the received message to all connected sockets. On the client this
 * message will be displayed in the 'Global' tab. param msg the message from the
 * client socket to be broadcast
 * @param {String} msg
 */
function handleChatMessage(msg) {
	console.log('message: ' + msg);
	io.emit('chat message', userOnline + ": " + msg);
}

var re = /^\w[ \w]*(?<=\w)$/
/**
 *  handling the registration of a user
 *  the user will be warned if the following rules are broken:
 *  1. the user name has to be longer then 0 characters
 *  2. the user name has to be unique
 *  3. TODO: user name must match the pattern (...)
 *  @param {String} name
 *  @param {JSON} userInfo
 *  @param {Object} socket
 */
function handleRegistration(name, userInfo, socket) {
	var answer = {};
	console.log(name + " tried to register")
	console.log(users)
	if(re.test(name)) {

		/*
		 * TODO: Name Global needs to be forbidden, too, set a pattern?
		 */
		var queryResult = {};
		doesUserExist(name,function(err,result){
			if(err){

			}else{
				queryResult.name = result;
			}
		});
		if (!queryResult.name) {
			console.log(name + ' is registered');
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
			addUserToDB(name,function(err,result){
				if(err){

				}else{
					console.log("user added" + result);
				}
			});
			socket.broadcast.emit('newuser',newUser);
		} else {
			console.log('user name: ' + name + ' already exists');
			answer.success = false;
			answer.msg = name + " already exists";
		}
    } else {
		console.log('user name: '+ name + ' doesn\'t match pattern');
		answer.success = false;
		answer.msg = name + " doesnt't match the pattern: at least one character, and may not end or start with whitspace";
	}
	socket.emit('registrationStatus', answer);
}

app.get('/', function(req, res) {
	console.log("Client IP: " + req.connection.remoteAddress)
	res.sendFile(__dirname + '/index.html');
});

/* handling socket.io processes, which includes event management, callbacks and message transfer */
io.on('connection', function(socket) {
	console.log('a user connected');
	var userInfo = {
			userOnline: null,
			hasRegistrated: null
	}
	//See SOCKET.IO CALLBACK FUNCTIONS Comment
	socket.on("registration", (name) => handleRegistration(name, userInfo, socket));
	socket.on('chat message', (msg) => handleChatMessage(msg));
	socket.on('disconnect', () => handleDisconnect(userInfo.hasRegistrated, userInfo.userOnline, socket));
	socket.on('broadcast', (data, callback,messageID) => handleBroadcast(data, callback,messageID, userInfo.userOnline, socket));
	socket.on('privatemessage', (data,callback,messageID) => handlePrivateMessage(data,callback,messageID, userInfo.userOnline));
	socket.on('privateUpload', (data, filename) => handlePrivateUpload(data, filename))
	socket.on('upload', (filename) => handleUpload(filename, socket, userInfo.userOnline))
	ss(socket).on('sendingbinary', (incomingStream, data) => handleSendingBinary(incomingStream, data,socket));
	
});

function connectToDB(){
	console.log("Test program to access DB2 sample database");

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
			} else {
				console.log("testing bro");
	
			/*
				On successful connection issue 
				param 1: The SQL query to be issued
				param 2: The callback function to execute when the database server responds
			*/
			databaseConnection = conn;
			
				// conn.close(function(){
				// 	console.log("Connection Closed");
				// });
		}
	});
	
}

function doesUserExist(userName,callback){
	databaseConnection.query(`select user from Users where user = ${userName}`, callback);
}

function addUserToDB(userName, callback){

	databaseConnection.query(`insert into Users values(${userName});`,callback);
}
connectToDB();


// Starting the server on specific port
http.listen(port, function() {
	console.log('listening on *:' + port);
});