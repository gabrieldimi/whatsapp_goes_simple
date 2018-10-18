var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var users = {}

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){
  console.log('a user connected');
  socket.on("registration", function(name){
     if (users.name){
      console.log(name + ' is registered');
      var pair = {};
      pair.connection = socket;
      users.name = pair;
     }else{
       console.log('user name: '+ name +' already exists');
     }
  });
  socket.on('chat message', function(msg){
    console.log('message: ' + msg);
  });
  socket.on('disconnect', function(){
    delete users[name];
    console.log(name +' disconnected and deleted');
  });
});

io.emit('some event', { for: 'everyone' });

http.listen(3000, function(){
  console.log('listening on *:3000');
});