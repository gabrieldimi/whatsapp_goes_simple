var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

function formatMessageData(data,userOnline){
	var messageData = {};
	messageData.userName = userOnline;
	messageData.payload = data.payload;
	var dateObj = new Date();
	var time = dateObj.getHours() + ":" + dateObj.getMinutes();
	var date = dateObj.getYear() + "-" + dateObj.getMonth() + "-" + dateObj.getDay();
	messageData.time = time;
	messageData.date = date;
	return messageData;
}
var users = {}

app.get('/', function(req, res) {
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
		if (!users[name]) { //Name Global needs to be forbidden, too
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
	
	socket.on('broadcast', function(data){
		var messageData = formatMessageData(data,userOnline);
		console.log("broadcast: " + userOnline + ": " + data.payload)
	    socket.broadcast.emit(data.emitName, messageData);
	});
	
	socket.on('privatemessage', function(data) {
		var messageData = formatMessageData(data,userOnline);
		console.log("private message to " + data.id);
		io.to(data.id).emit('clientPrivateMessage', data);
	});
});



// io.emit('some event', { for: 'everyone' });

http.listen(3000, function() {
	console.log('listening on *:3000');
});