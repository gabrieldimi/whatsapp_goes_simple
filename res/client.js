	$(function() {
		
		var dropArea = $('#chatBody')[0];
		
		function preventDefaults(e) {
			e.preventDefault();
			e.stopPropagation();
		}
		
		function unhighlight() {
			$('#dropOverlay').css({'opacity': '0'})
		}
		
		
		;['dragenter', 'dragleave', 'dragover', 'drop'].forEach(eventName => {
			dropArea.addEventListener(eventName, preventDefaults, false);
		});
		
		;['dragleave', 'drop'].forEach(eventName => {
			dropArea.addEventListener(eventName, unhighlight, false);
		});
		
		
		dropArea.addEventListener('dragenter', function() {
			console.log('dragenter');
			$('#dropOverlay').css({'opacity': '0.5'});
		}); //change to actual droparea
		
		dropArea.addEventListener('drop', function(e) {
			console.log(e.dataTransfer.files);
		});
		
		var nr = 2;
		function addUser(name, id) {
			$("#contacts").append(
					$('<li>').append(
							$('<a>').attr("href", "#tabs-" + nr).text(name)));
			var newPanel = $('<div>').attr("id", "tabs-" + nr).append(
					$('<ul>').addClass('privateMessage'))
			$("#chatBody").append(newPanel)
			hashmap[name] = {
				"id" : id,
				"panel" : newPanel,
				"listEntryID" : nr
			}
			nr++;
		}

		function removeUser(username) {
			userinfo = hashmap[username];
			if (userinfo !== undefined) {
				$(userinfo.panel).remove();
				$(
						'#contacts li[aria-labelledby=ui-id-'
								+ userinfo.listEntryID + ']').remove()
				console.log('user' + username + 'removed')
			} else {
				console.log("couldnt remove user. Not in hashmap")
			}
		}

		function formatMessage(messageObj) {
			return $('<li>').append(
					$('<pre>').text(
							messageObj.userName + ': ' + messageObj.payload
									+ '\n' + messageObj.time + '\n'
									+ messageObj.date));
		}

		function markedMessage(src, msgBody) {
			var img = $('<img>').attr('src', src).addClass('icon');
			var li = $('<li>').addClass('listEntry');
			var span = $('<div>').text(msgBody).addClass("markedMessage");
			li.append(img);
			li.append(span);
			$('#messages').append(li)
		}

		function markedMessageEntered(username) {
			markedMessage('enter.png', username
					+ ": has entered the room")
		}

		function markedMessageLeft(username) {
			markedMessage('leave.png', username
					+ ": has left the room")
		}

		var socket = io();
		var hashmap = {};
		var currentSID;
		var currentPanel;
		var selfName;

		$('#registration').submit(function() {
			socket.emit('registration', $('#regInput').val());
			return false;
		});

		socket.on('registrationStatus', function(obj) {
			console.log(obj);
			if (obj.success) {
				selfName = obj.selfName;
				if (obj.users) {
					console.log("all known users: ")
					console.log(obj.users);
					for ( var key in obj.users) {
						if (key != selfName) {
							console.log("adding:")
							console.log(key)
							addUser(key, obj.users[key].connection); //connection bad name, server should not send selfName, obj bad name
						}
					}
					$("#tabs").tabs("refresh");
				}
				$('#regOverlay').css("display", "none");
				$('#blurry').css("filter", "none");
			}
		});

		$('#messageInput').submit(
				function() {
					if (currentSID !== undefined) { //if not Global selected
						socket.emit('privatemessage', {
							'id' : currentSID,
							'payload' : $('#m').val(),
							'sender' : selfName
						})
						currentPanel.find(".privateMessage").append(
								$('<li>').text($('#m').val()).css({
									"text-align" : "right",
									"padding-left" : "20%"
								}));
					} else {
						socket.emit('broadcast', {
							emitName : "chat message",
							payload : $('#m').val()
						});
						$('#messages').append(
								$('<li>').text($('#m').val()).css({
									"text-align" : "right",
									"padding-left" : "20%",
									"clear": "left"
								}));
					}
					$('#m').val('')
					return false;
				});

		socket.on('chat message', function(messageObj) {
			$('#messages').append(formatMessage(messageObj));
		});

		socket.on('clientPrivateMessage', function(messageObj) {
			//sender on server sent
			hashmap[messageObj.userName].panel.find(".privateMessage").append(
					formatMessage(messageObj));
		});

		socket.on('newuser', function(userinfo) {
			console.log(userinfo);
			addUser(userinfo.name, userinfo.socketid);
			markedMessageEntered(userinfo.name);
			$("#tabs").tabs("refresh");
		});

		socket.on('userisgone', function(username) {
			console.log('disconnected ' + username)
			removeUser(username);
			markedMessageLeft(username);
		})

		/* JQUERY-UI */

		$("#tabs")
				.tabs(
						{
							active : 0,
							show : {
								effect : "fadeIn",
								duration : 400,
							},
							activate : function(event, ui) {
								console.log(event)
								console.log(ui)
								console
										.log(ui.newTab[0].firstElementChild.textContent)
								if (ui.newTab[0].firstElementChild.textContent == "Global") {
									currentSID = undefined; //Improve
								} else {
									currentSID = hashmap[ui.newTab[0].firstElementChild.textContent].id;
								}
								currentPanel = ui.newPanel;
								console.log("sid changed to: " + currentSID)
							}
						}).addClass("ui-tabs-vertical ui-helper-clearfix");
		$("#tabs li").removeClass("ui-corner-top").addClass("ui-corner-left");
	});
