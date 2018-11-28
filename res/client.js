/*
Contributors: Gabriel Dimitrov, Julian Leuze
*/
$(function() {

		//contains the current blob URL of the current profile image
		var blobStore;
		$("#profilePicker").on("change", (event) => {
			var file = event.target.files[0];
			//New profile picture has been picked, old blob is not needed anymore
			if(blobStore) {
				URL.revokeObjectURL(blobStore);
			}
			blobStore = file;
			var url = URL.createObjectURL(file);
			$("#profilePreview").attr('src', url);
		})

		/* Making sure the user gets quick feedback whether the input was correct*/
		function addCustomInputErrorMessages() {
			$("#regInput").on("input", (event) => {
				if(event.target.validity.patternMismatch) {
				event.target.setCustomValidity("Username must contain at least one character and may not start or end with whitespace. Allowed characters are lower- and uppercase letters, spaces and underscores. Username: 'Global' is not allowed")
			} else {
				//Needs to be empty to validate
				event.target.setCustomValidity("");
			}
			}
			);

			$("#passwd").on("input", (event) => {
				if(event.target.validity.patternMismatch) {
					event.target.setCustomValidity("Password must contain at least one uppercase, one lowercase, one digit and one special character. The password must be at least 8 characters long")
				} else {
					//Needs to be empty to validate
					event.target.setCustomValidity("");
				}
			}
			);
		}
		addCustomInputErrorMessages();

		/* Adds the functionality to switch between
		 * the registration form
		 * and the login form
		 */
		function addFormToggle() {
			$("#toLogin").on("click", () => {
				$("#loginContainer").css('display', 'block');
				$("#container").css('display', 'none')
			})

			$("#toRegistration").on("click", () => {
				$("#container").css('display', 'block');
				$("#loginContainer").css('display', 'none')
			})
		}
		addFormToggle();

		/* Adds the functionality
		 * to take a screenshot
		 * right from the webcam
		 */
		function prepareWebcamUI() {
			var captureWebcam = $("#captureWebcam");
			var takeSnapshot = $("#takeSnapshot")
			var stopWebcam = $("#stopWebcam")
			var regOverlay = $("#regOverlay")
			var videoOverlay = $("#videoOverlay")
			var preview = $("#webcamPreview")
			var profilePreview = $("#profilePreview")
			var profileCanvas = $("#profileCanvas")
			var mediaStreamTrack;
			ctx = profileCanvas[0].getContext('2d')
			captureWebcam.on("click", () => {
				if (navigator.mediaDevices.getUserMedia) {
					navigator.mediaDevices.getUserMedia({video: true}).then(function(stream) {
						videoOverlay.css('display', 'block')
						regOverlay.css('filter', 'blur(1px)')
						preview[0].srcObject = stream;
						mediaStreamTrack = stream.getVideoTracks()[0]
						console.log("webcam stream started")
					}).catch(function(error) {
						console.log("Webcam: Something went wrong!");
						console.log(error)
					});
				} else {
					$('#captureWebcam').css('display', 'none');
					console.log("navigator.mediaDevices.getUserMedia API not available")
				}
			})

			takeSnapshot.on('click', () => {
					ctx.drawImage(preview[0], 0, 0, 256, 256);
					profileCanvas[0].toBlob(blob => {
						//New snap has been taken, old blob is not needed anymore
						if(blobStore) {
							URL.revokeObjectURL(blobStore);
						}
						blobStore = blob;
						url = URL.createObjectURL(blob);
						profilePreview.attr('src', url)
					})
			})

			stopWebcam.on("click", () => {
				videoOverlay.css('display', 'none')
				regOverlay.css('filter', '')
				if(mediaStreamTrack) {
					mediaStreamTrack.stop();
				}
			});
		}
		prepareWebcamUI();

		function addLeadingZeroToMinutes(dateObject){
		mins = dateObject.getMinutes();
		if(mins < 10){
			mins = '0'+ mins;
		}
		return mins;
		}

		function getTimeStamp()	{
			var timestamp ={};
			var dateObj = new Date();
			var time = dateObj.getHours() + ":" + addLeadingZeroToMinutes(dateObj);
			var date = dateObj.getUTCFullYear() + "-" + (dateObj.getUTCMonth() +1) + "-" + dateObj.getDate();
			timestamp.time =time;
			timestamp.date = date;
		    return timestamp;
		}

		var chatBody = $('#chatBody')[0];
		/*
		 * To be invoked after a new message has been received, to scroll to the
		 * latest message
		 */
		function scrollToBottom() {
			chatBody.scrollTop = chatBody.scrollHeight;
		}

		function buildMediaElem(type) {
			var mediaElem;
			switch(type.substring(0, type.indexOf("/"))) {
				case "image":
					var mediaElem = document.createElement('img');
				break;
				case "video":
					var mediaElem = document.createElement('video');
					$(mediaElem).attr('controls', '')
					$(mediaElem).on('keydown', event => {
						if(event.keyCode === 75) {
							console.log(this, event.target)
							if(event.target.paused) {
								event.target.play();
							} else {
								event.target.pause();
							}
						}
					})
				break;
				case "audio":
					var mediaElem = document.createElement('audio');
					$(mediaElem).attr('controls', '')
				break;
			}
			$(mediaElem).addClass('mediaMessage')
			return mediaElem;
		}

		/*
		 * Invoked whenever there is media files to be received
		 */
		function handleMediaFile(stream, data) {
			fileBuffer = [],
		  fileLength = 0;
			console.log('HANDLE MEDIA FILES TRIGGERED');
			console.log(data);
			stream.on('data', function (chunk) {
				fileLength += chunk.length;
				console.log('fileLength: ' + fileLength)
		    // var progress = Math.floor((fileLength / fileInfo.size) * 100);
		    // progress = Math.max(progress - 2, 1);
		    fileBuffer.push(chunk);
      });

			 stream.on('end', function () {
					if(fileLength != data.size) {
						console.error("fileLength != data.size. --> corrupt file?")
					}
	                var filedata = new Uint8Array(fileLength),
	                i = 0;

	                // == Loop to fill the final array
	                fileBuffer.forEach(function (buff) {
	                    for (var j = 0; j < buff.length; j++,i++) {
	                        filedata[i] = buff[j];
	                    }
	                });

	                blob = new Blob([filedata], {
	                    type : data.type
	                }),
					url = window.URL.createObjectURL(blob);
					var mediaElem = buildMediaElem(data.type);
	        console.log("URL:");
					console.log(url);
					mediaElem.src = url;
					$('#messages').append(mediaElem);
					scrollToBottom();
			 });
		}

		var dropArea = $('#chatBody')[0];
		var messageID = 0;

		function preventDefaults(e) {
			e.preventDefault();
			e.stopPropagation();
		}

		function unhighlight() {
			$('#dropOverlay').css({'opacity': '0'})
		}

		function highlight() {
			$('#dropOverlay').css({'opacity': '0.5', 'border':'3px dashed white'});
		}

		function getMessageID() {
			return messageID++;
		}

		function handleFiles(file) {
			console.log(file)
			var stream = ss.createStream({
				objectMode: true,
				highWaterMark: 16384
			});

			ss(socket).emit('sendingbinary', stream, {
	      size : file.size,
				name : file.name,
				type: file.type
			});
			ss.createBlobReadStream(file).pipe(stream)
			if (currentSID !== undefined) {
				console.log('emit upload to ' + currentSID)
				socket.emit('privateUpload', {
					'id' : currentSID
				}, file.name);
			} else {
				socket.emit('upload', file.name);
			}
		}

		// Prevent Default Handling for these events, i.e. opening the dropped
		// file in a new tab
		;['dragenter', 'dragleave', 'dragover', 'drop'].forEach(eventName => {
			dropArea.addEventListener(eventName, preventDefaults, false);
		});


		// give visual feedback on dragging
		;['dragenter', 'dragover'].forEach(eventName => {
			dropArea.addEventListener(eventName, highlight, false);
		});

		;['dragleave', 'drop'].forEach(eventName => {
			dropArea.addEventListener(eventName, unhighlight, false);
		});


		dropArea.addEventListener('drop', function(e) {
			console.log(e.dataTransfer.files);

			for(var i = 0; i < e.dataTransfer.files.length; i++) {
				var file = e.dataTransfer.files[i];
				console.log("LOOPING OVER FILELIST: ", file);
				var mediaElem = buildMediaElem(file.type);
				url = URL.createObjectURL(file);
				mediaElem.src = url;
				appendToActiveTab('',mediaElem); //FIXME: empty parameter
				handleFiles(file) // TODO: move loop to receiver
			}
		});

		var nr = 2;
		// adds a new tab and Panel for every user
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

		// removes tab and Panel of diconnected user
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

		// properly formats messages to include name, payload and timestamp
		function formatMessage(messageObj, cssClazz) {
			messageEntry = $('<li>');
			if(messageObj.mediaElem) {
				messageEntry.append(messageObj.mediaElem);
			}
			messageEntry.append(
					$('<pre>').text(
							messageObj.userName + ':\n\n' + messageObj.payload
									+ '\n\n' + messageObj.time + '\n'
									+ messageObj.date)).addClass(cssClazz);
			if(messageObj.mood) {
				messageEntry.addClass((messageObj.mood === 'happy' ? 'good':'bad'))
			}
			return messageEntry;
		}

		// adds a marked message to the room
		function markedMessage(src, msgBody) {
			var img = $('<img>').attr('src', src).addClass('icon');
			var li = $('<li>').addClass('listEntry');
			var span = $('<div>').append(msgBody).addClass("markedMessage");
			li.append(img);
			li.append(span);
			return li;
		}

		// invoked when new user enters room
		function markedMessageEntered(username) {
			$('#messages').append(markedMessage('enter.png', username
					+ ": has entered the room"))
		}

		// invoked when a user left room
		function markedMessageLeft(username) {
			$('#messages').append(markedMessage('leave.png', username
					+ ": has left the room"))
		}

		// getting timestamp for posted message from server
		function callback(timestamp, messageID) {
			console.log('server callback timestamp: ');
			console.log(timestamp);
		// $('#chatBody').find("chat-" + messageID).append(timestamp) not
		// implemented on server yet
		}

		var socket = io();
		var hashmap = {};
		var currentSID;
		var currentPanel;
		var selfName;

		/*
		 * Invoked when on successfully filling out the registration formatMessage
		 */
		$('#registration').submit(function() {
			var writableStream = ss.createStream();
			var file = blobStore;
			console.log('file:', file)
			if(file instanceof Blob) {
				var registrationData = {};
				registrationData.userName = $('#regInput').val();
				registrationData.password = $('#passwd').val();
				registrationData.fileSize = file.size;
				console.log(registrationData);
				ss(socket).emit('registration', writableStream, registrationData);
				ss.createBlobReadStream(file).pipe(writableStream);
			} else {
				$("#errorMessage").text('please provide a profile picture.')
			}
			return false;
		});

		//TODO: Documentation
		$('#login').submit(function() {
			var loginData = {};
			loginData.userName = $('#logInput').val();
			loginData.password = $('#loginPasswd').val();
			socket.emit('login', loginData);
			console.log('emmitted: ', loginData);
			return false;
		});

		//Triggered when Enter is pressed on the text-input or when the send button is clicked
		$('#messageInput').submit(
				function() {
					console.log('callback: ', callback)
					var currentMessageID = getMessageID();
					var messageObj = {}
					messageObj.payload = $('#m').val()
					messageObj.userName = selfName;
					var timestamp = getTimeStamp()
					messageObj.date = timestamp.date;
					messageObj.time = timestamp.time;
					if (currentSID !== undefined) { // if not Global selected
						socket.emit('privatemessage', {
							'id' : currentSID,
							'payload' : $('#m').val(),
							'sender' : selfName
						}, callback, currentMessageID)
						currentPanel.find(".privateMessage").append(formatMessage(messageObj, 'senderMessage').attr('id', "sent-" + currentMessageID));
					} else {
						socket.emit('broadcast', {
							emitName : "chat message",
							payload : $('#m').val(),
							"callback": callback
						}, callback, currentMessageID);
						$('#messages').append(formatMessage(messageObj, 'senderMessage').attr('id', "sent-" + currentMessageID));
					}
					$('#m').val('')
					scrollToBottom();
					return false;
				});

				/*
				 * TODO: use as only one
				*/
				function appendToActiveTab(elem, mediaElem) {
					var currentMessageID = getMessageID();
					var messageObj = {}
					messageObj.payload = '';
					messageObj.userName = selfName;
					var timestamp = getTimeStamp()
					messageObj.date = timestamp.date;
					messageObj.time = timestamp.time;
					messageObj.mediaElem = mediaElem;
					if (currentSID !== undefined) { // if not Global selected
						currentPanel.find(".privateMessage").append(formatMessage(messageObj, 'senderMessage').attr('id', "sent-" + currentMessageID));
					} else {
						$('#messages').append(formatMessage(messageObj, 'senderMessage').attr('id', "sent-" + currentMessageID));
					}
				}

		/* ----------------------- SOCKET.IO CALLBACK FUNCTIONS ------------------------------*/

		/**
		 * Notifies the server of a disconnect e.g. when the tab is closed
		 * so that resources can be properly freed
		 * @param {String} username
		 */
		function handleUserisgone(username) {
			console.log('disconnected ' + username)
			removeUser(username);
			markedMessageLeft(username);
		}

		/**
		 * called when a new user logs in.
		 * adds the user to a new tab and leaves a marked message in the chat window
		 * @param {String} userinfo
		 */
		function handleNewuser(userinfo) {
			console.log(userinfo);
			addUser(userinfo.name, userinfo.socketid);
			markedMessageEntered(userinfo.name);
			$("#tabs").tabs("refresh");
		}

		/**
		 * TO BE REMOVED
		 * @param {JSON} messageObj
		 */
		function handleClientUpload(messageObj) {
			console.log('uploadnotice: broadcast')
			$('#messages').append(fileUploaded(messageObj.filename, " by ", messageObj.userName))
		}

		/**
		 * TO BE REMOVED
		 * @param {*} messageObj
		 */
		function handleClientPrivateUpload(messageObj) {
			console.log('uploadnotice')
			hashmap[messageObj.userName].panel.find(".privateMessage").append(fileUploaded(messageObj.filename))
		}

		/**
		 * Invoked whenever a user receives a whisper, adding the message
		 * to the apropriate tab
		 * @param {JSON} messageObj
		 */
		function handleClientPrivateMessage(messageObj) {
			// sender on server sent
			console.log('reply from user: ' + messageObj.userName)
			hashmap[messageObj.userName].panel.find(".privateMessage").append(
					formatMessage(messageObj, 'recipientMessage'));
					console.log(messageObj.userName + " is " + messageObj.mood)
					scrollToBottom();
		}

		/**
		 * Invoked whenver a brodcast message is received, adding it to the Global tab
		 * @param {JSON} messageObj
		 */
		function handleChatMessage(messageObj) {
			$('#messages').append(formatMessage(messageObj, 'recipientMessage'));
			scrollToBottom();
		}

		/*
			Implementation for handleLoginStatus and handleRegistrationStatus
		*/
		function handleLogin(obj) {
			if (obj.success) {
				selfName = obj.selfName;
				if (obj.users) {
					console.log("all known users: ")
					console.log(obj.users);
					for ( var key in obj.users) {
						if (key != selfName && !hashmap[key]) {
							console.log("adding:", key)
							addUser(key, obj.users[key].connection); // TODO: connection bad name server should not send selfName, obj bad name
						}
					}
					$("#tabs").tabs("refresh");
				}
				$('#regOverlay').css("display", "none");
				$('#blurry').css("filter", "none");
			} else {
				console.log(obj.msg);
				$('#regOverlay #errorMessage').text(obj.msg);
				URL.revokeObjectURL(blobStore);
			//	$('$logInput').addClass('errorBoxOutline');
			}
		}

		/** TODO: Possibly as return value of connection?
		 * Callback for handling the registration.
		 * Either registers the user to the server and loads all current know chat partners
		 * or display an error in the UI giving more information on what went wrong
		 * data-structure of obj:
		 * obj = {
		 * 		users: {
		 * 			"username1": {
		 * 				"connection": socket.id
		 * 			},
		 * 			"username2": {
		 * 				"connection": socket.id
		 * 			}, ...
		 * 		},
		 * 		success: boolean,
		 * 		selfName: String,
		 * 		msg: String
		 * }
		 * @param {JSON} obj
		 */
		function handleRegistrationStatus(obj) {
			handleLogin(obj);
		}

		/*Callback for handling the logInput
		Does the same as handleRegistrationStatus
		*/
		function handleLoginStatus(obj) {
			handleLogin(obj);
		}
		//See SOCKET.IO CALLBACK FUNCTIONS, registering all callback functions
		socket.on('registrationStatus', (obj) => handleRegistrationStatus(obj));
		socket.on('chat message', (messageObj) => handleChatMessage(messageObj));
		socket.on('clientPrivateMessage', (messageObj) => handleClientPrivateMessage(messageObj));
		socket.on('newuser', (userinfo) => handleNewuser(userinfo));
		socket.on('userisgone', (username) => handleUserisgone(username))
		socket.on('loginStatus', answer => handleLoginStatus(answer))
		ss(socket).on('serverPushMediaFile', (stream, data) => handleMediaFile(stream,data))

		/* JQUERY-UI */
		$("#tabs")
				.tabs(
						{
							active : 0,
							show : {
								effect : "fadeIn",
								duration : 400,
							},
							// will be called when switching to another tab
							activate : function(event, ui) {
								console.log(ui.newTab[0].firstElementChild.textContent)
								if (ui.newTab[0].firstElementChild.textContent == "Global") {
									currentSID = undefined; // Improve
								} else {
									currentSID = hashmap[ui.newTab[0].firstElementChild.textContent].id;
								}
								currentPanel = ui.newPanel;
								console.log("sid changed to: " + currentSID)
							}
						}).addClass("ui-tabs-vertical ui-helper-clearfix");
		$("#tabs li").removeClass("ui-corner-top").addClass("ui-corner-left");
		/* JQUERY-UI END */
	});
