/* 
Contributors: Gabriel Dimitrov, Julian Leuze
*/

const express = require('express')
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');
const ss = require('socket.io-stream');
// var fs = require('fs');
var request = require('request')

// add folders to virtual namespace
app.use(express.static('icons'));
app.use(express.static('res'));
// app.use(express.static('media'))

// handle port on ibmcloud and stay compatible for local development
let port = process.env.PORT || 3000;
// key-value user database to keep track of active users
var users = {}

function addLeadingZeroToMinutes(dateObject){
	mins = dateObject.getMinutes();
    if(mins < 10){
		mins = '0'+ mins;
	}
	return mins;
}

function formatMessageData(data,userOnline){
	var messageData = {};
	messageData.userName = userOnline;
	messageData.payload = data.payload;
	var dateObj = new Date();
	var time = dateObj.getHours() + ":" + addLeadingZeroToMinutes(dateObj);
	console.log("time: " + time );
	var date = dateObj.getUTCFullYear() + "-" + (dateObj.getUTCMonth() +1) + "-" + dateObj.getDate();
	messageData.time = time;
	messageData.date = date;
	return messageData;
}

function sendMessageWithTimestamp (data,userOnline,callback,messageID){
  var dateObj = new Date();
  var time = dateObj.getHours() + ":" + dateObj.getMinutes();
  var date = dateObj.getUTCFullYear() + "-" + (dateObj.getUTCMonth() +1) + "-" + dateObj.getDate();
  var messageData = formatMessageData(data,userOnline);
  // callback({"time": time, "date": date},messageID) TODO: figure out why not
	// working or remove
  return messageData;
}

function analyzeMood(data) {
	return new Promise(function (resolve, reject) {
	console.log('analyzing mood...')
	request({
		headers: {
			'Content-Type': 'application/json'
		},
		uri: 'https://zealous-bhabha.eu-de.mybluemix.net/tone',
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

// SOCKET.IO METHODS
function handleDisconnect(hasRegistrated, userOnline, socket) {
	if (hasRegistrated) {
		socket.broadcast.emit("userisgone",userOnline);
		delete users[userOnline];
		console.log(userOnline + 'has been deleted');
	}
	console.log('user disconnected');
}

/*
 * data-structure of param data: TODO: data = { }
 * 
 * 
 */
function handleBroadcast(data, callback,messageID, userOnline, socket){
	console.log(callback);
	console.log(messageID)
	console.log("broadcast: " + userOnline + ": " + data.payload);
	var messageData = sendMessageWithTimestamp (data,userOnline,callback,messageID);
    socket.broadcast.emit(data.emitName, messageData);
}

/*
 * Callback for when whisper is issued data-structure of param data see:
 * handleBroadcast
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

/*
 * This function will trigger a marked message in the private room of the
 * recipient whenever a file has been uploaded TODO: param
 */
function handlePrivateUpload(data, filename) {
	console.log('server uploadnotice')
	io.to(data.id).emit('clientPrivateUpload', {"userName": userOnline, 'filename': filename})
}

/*
 * This function will trigger a marked message in the global room whenever a
 * file has been uploaded TODO: param
 */
function handleUpload(filename, socket, userOnline) {
	console.log('server uploadnotice')
	socket.broadcast.emit('clientUpload', {"userName": userOnline, 'filename': filename})
}

/*
 * Sends the received message to all connected sockets. On the client this
 * message will be displayed in the 'Global' tab. param msg the message from the
 * client socket to be broadcast
 */
function handleChatMessage(msg) {
	console.log('message: ' + msg);
	io.emit('chat message', userOnline + ": " + msg);
}

function handleRegistration(name, userInfo, socket) {
	var answer = {};
	console.log(name + " tried to register")
	console.log(users)
	if(name.length > 0){

		/*
		 * TODO: Name Global needs to be forbidden, too, set a pattern?
		 */
		if (!users[name]) { 
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
			socket.broadcast.emit('newuser',newUser);
		} else {
			console.log('user name: ' + name + ' already exists');
			answer.success = false;
			answer.msg = name + " already exists";
		}
    }else{
		console.log('user name: '+ name + ' is too short');
		answer.success = false;
		answer.msg = name +" is too short";
	}
	socket.emit('registrationStatus', answer);
}

app.get('/', function(req, res) {
	console.log("Client IP: " + req.connection.remoteAddress)
	res.sendFile(__dirname + '/index.html');
});

/* On User connects */
io.on('connection', function(socket) {
	console.log('a user connected');
	var userInfo = {
			userOnline: null,
			hasRegistrated: null
	}
	//See SOCKET.IO METHODS Comment
	socket.on("registration", (name) => handleRegistration(name, userInfo, socket));
	socket.on('chat message', (msg) => handleChatMessage(msg));
	socket.on('disconnect', () => handleDisconnect(userInfo.hasRegistrated, userInfo.userOnline, socket));
	socket.on('broadcast', (data, callback,messageID) => handleBroadcast(data, callback,messageID, userInfo.userOnline, socket));
	socket.on('privatemessage', (data,callback,messageID) => handlePrivateMessage(data,callback,messageID, userInfo.userOnline));
	socket.on('privateUpload', (data, filename) => handlePrivateUpload(data, filename))
	socket.on('upload', (filename) => handleUpload(filename, socket, userInfo.userOnline))
	ss(socket).on('sendingbinary', (incomingStream, data) => handleSendingBinary(incomingStream, data,socket));
	
});

// Starting the server
http.listen(port, function() {
	console.log('listening on *:' + port);
});