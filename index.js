var express = require('express')
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');
var ss = require('socket.io-stream');

app.use(express.static('icons'));
app.use(express.static('res'));

function formatMessageData(data,userOnline){
	var messageData = {};
	messageData.userName = userOnline;
	messageData.payload = data.payload;
	var dateObj = new Date();
	var time = dateObj.getHours() + ":" + dateObj.getMinutes();
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
  callback({"time": time, "date": date},messageID);
}
var users = {}

app.get('/', function(req, res) {
	console.log("Client IP: " + req.connection.remoteAddress)
	res.sendFile(__dirname + '/index.html');
});


io.on('connection', function(socket) {
	console.log('a user connected');
	var userOnline;
	var hasRegistrated;
	socket.on("registration", function(name) {
		var answer = {};
		console.log(name + " tried to register")
		console.log(users)
		if (!users[name]) { // Name Global needs to be forbidden, too
			console.log(name + ' is registered');
			var pair = {};
			users[name] = pair;
			pair.connection = socket.id;
			userOnline = name;
			answer.users = users;
			hasRegistrated = true;
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

		socket.emit('registrationStatus', answer);
	});
	socket.on('chat message', function(msg) {
		console.log('message: ' + msg);
		io.emit('chat message', userOnline + ": " + msg);
	});
	socket.on('disconnect', function() {
		if (hasRegistrated) {
			socket.broadcast.emit("userisgone",userOnline);
			delete users[userOnline];
			console.log(userOnline + 'has been deleted');
		}
		console.log('user disconnected');
	});
	
	
	socket.on('broadcast', function(data, callback,messageID){
		console.log("broadcast: " + userOnline + ": " + data.payload);
		sendMessageWithTimestamp (data,userOnline,callback,messageID);
		
		
	    socket.broadcast.emit(data.emitName, messageData);
	});

	ss(socket).on('sendingbinary', function(stream, data) {
		var filename = path.basename(data.name);
		fs.createReadStream(filename).pipe(stream);
	});

	
	socket.on('privatemessage', function(data,userOnline,callback,messageID) {
		sendMessageWithTimestamp (data,userOnline,callback,messageID)
		console.log("private message to " + data.id);
		io.to(data.id).emit('clientPrivateMessage', messageData);
	});
});

// io.emit('some event', { for: 'everyone' });

http.listen(3000, function() {
	console.log('listening on *:3000');
});