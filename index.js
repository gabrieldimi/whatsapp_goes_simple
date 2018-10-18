var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var users = {}

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){
  console.log('a user connected');
  var userOnline;
  var hasRegistrated;
  socket.on("registration", function(name){
     if (users.name){
      console.log(name + ' is registered');
      var pair = {};
      pair.connection = socket;
      users.name = pair;
      userOnline = name;
      hasRegistrated = true;
     }else{
       console.log('user name: '+ name +' already exists');
     }
  });
  socket.on('chat message', function(msg){
    console.log('message: ' + msg);
  });
  socket.on('disconnect', function(){
    if(hasRegistrated){
      delete users[userOnline];
      console.log(userOnline +'has been deleted');
    }
    console.log('user disconnected');
  });
});

io.emit('some event', { for: 'everyone' });

http.listen(3000, function(){
  console.log('listening on *:3000');
});