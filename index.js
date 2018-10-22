var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

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
		console.log(users[name])
		if (!users[name]) {
			console.log(name + ' is registered');
			var pair = {};
			pair.connection = socket;
			users.name = pair;
			userOnline = name;
			hasRegistrated = true;
			answer.success = true;
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
			delete users[userOnline];
			console.log(userOnline + 'has been deleted');
		}
		console.log('user disconnected');
	});
	
	socket.on('broadcast', function(data){
		console.log("broadcast: " + userOnline + ": " + data.payload)
	    socket.broadcast.emit(data.emitName, userOnline + ": " + data.payload);
	});
});

// io.emit('some event', { for: 'everyone' });

http.listen(3000, function() {
	console.log('listening on *:3000');
});