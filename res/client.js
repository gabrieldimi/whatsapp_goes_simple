/*
Contributors: Gabriel Dimitrov, Julian Leuze
*/
//Polyfill for toBlob()
if (!HTMLCanvasElement.prototype.toBlob) {
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    value: function (callback, type, quality) {
      var dataURL = this.toDataURL(type, quality).split(',')[1];
      setTimeout(function() {

        var binStr = atob( dataURL ),
            len = binStr.length,
            arr = new Uint8Array(len);

        for (var i = 0; i < len; i++ ) {
          arr[i] = binStr.charCodeAt(i);
        }

        callback( new Blob( [arr], {type: type || 'image/png'} ) );

      });
    }
  });
}

$(function() {

		//Globals
		var socket = io();
		/*
		 * Hashmap containing info about all currently known logged in users.
		 * Structure: {
		 			"username" : {
            "id:": id,
            "panel": panel,
            "listEntryID": listEntryID
				},
				"socketid": panel
	 		}
		 */
		var hashmap = {};
		var currentSID;
		var currentPanel;
		var selfName;
		var dropArea = $('#chatBodyContainer')[0];
		var messageID = 0;
		var chatBody = $('#chatBody')[0];
		var blobStore; //contains the current blob URL of the current profile image
    //tab id for activer user list, used by JQUERY-UI
		var nr = 2;

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
			});

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

    //Helper function for better date format
		function addLeadingZeroToMinutes(dateObject) {
		mins = dateObject.getMinutes();
		if(mins < 10){
			mins = '0'+ mins;
		}
		return mins;
		}

    //function to build a timestamp
		function getTimeStamp()	{
			var timestamp ={};
			var dateObj = new Date();
			var time = dateObj.getHours() + ":" + addLeadingZeroToMinutes(dateObj);
			var date = dateObj.getUTCFullYear() + "-" + (dateObj.getUTCMonth() +1) + "-" + dateObj.getDate();
			timestamp.time =time;
			timestamp.date = date;
		    return timestamp;
		}

		/*
		 * To be invoked after a new message has been received, to scroll to the
		 * latest message
		 */
		function scrollToBottom() {
			chatBody.scrollTop = chatBody.scrollHeight;
		}

    //Creates the proper HTML element for received media
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
		function handleMediaFile(stream, data, idSender) {
			console.log('handleMediaFile() ', idSender);
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

	                //Loop to fill the final array
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
					var currentMessageID = getMessageID();
					var messageObj = {}
					messageObj.payload = '';
					messageObj.userName = selfName;
					var timestamp = getTimeStamp()
					messageObj.date = timestamp.date;
					messageObj.time = timestamp.time;
					messageObj.mediaElem = mediaElem;
					if(idSender) {
						hashmap[idSender].panel.find(".privateMessage").append(formatMessage(messageObj, 'recipientMessage').attr('id', "sent-" + currentMessageID));
					} else {
						$('#messages').append(formatMessage(messageObj, 'recipientMessage').attr('id', "sent-" + currentMessageID));
					}
					scrollToBottom();
			 });
		}

    // Prevent Default Handling for these events, i.e. opening the dropped
		// file in a new tab
		function preventDefaults(e) {
			e.preventDefault();
			e.stopPropagation();
		}

    //remove dropzone after file has been dropped
		function unhighlight() {
			$('#dropOverlay').css('visibility', 'hidden')
		}

    //Make dropzone visible on file drag
		function highlight() {
			$('#dropOverlay').css('visibility', 'visible');
		}

    //function to keep track of message IDs
		function getMessageID() {
			return messageID++;
		}

    //Invoked when file is dropped in dropzone, starting the transmison of the file
		function handleFiles(file) {
			console.log(file)
      //stream needs to be in objectMode to transfer files bigger than 16KiB
			var stream = ss.createStream({
				objectMode: true,
				highWaterMark: 16384
			});

			ss(socket).emit('sendingbinary', stream, {
	      size : file.size,
				name : file.name,
				type: file.type
			}, currentSID);
			ss.createBlobReadStream(file).pipe(stream)
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

    //remove dropzone after file has been dropped
		;['dragleave', 'drop'].forEach(eventName => {
			dropArea.addEventListener(eventName, unhighlight, false);
		});

    //Listener for the filedrop event
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
			//Mapping socketID to map of its corresponding tab
			hashmap[id] = newPanel;
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

		/*
		 * Invoked when on successfully filling out the registration formatMessage
		 */
		$('#registration').submit(function() {
			var writableStream = ss.createStream();
			var file = blobStore;
			console.log('file:', file)
			if(file instanceof Blob) {
				$('#loadingOverlay').css('display', 'block');
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

		//function to handle login of users
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
         * function to append received messages and media to the proper panel
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
      console.log(`Login: ${JSON.stringify(obj)}, raw: ${obj}`)
			$('#loadingOverlay').css('display', 'none');
			if (obj.success) {
				selfName = obj.selfName;
				if (obj.users) {
					console.log("all known users: ")
					console.log(obj.users);
					for ( var key in obj.users) {
						if (key != selfName && !hashmap[key]) {
							console.log("adding:", key)
							addUser(key, obj.users[key].connection ? obj.users[key].connection : obj.users[key]); // TODO: connection bad name server should not send selfName, obj bad name
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
		socket.on('registrationStatus', handleRegistrationStatus);
		socket.on('chat message', handleChatMessage);
		socket.on('clientPrivateMessage', handleClientPrivateMessage);
		socket.on('newuser', handleNewuser);
		socket.on('userisgone', handleUserisgone)
		socket.on('loginStatus', handleLoginStatus)
		ss(socket).on('serverPushMediaFile', handleMediaFile)
    socket.on('instance', (id) => {document.title += " " + id})

		/* JQUERY-UI */
    //inital creation of the user tab list
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
