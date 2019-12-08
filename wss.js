"use strict";
const WebSocket = require('ws');
const serverUrl = "wss://localhost:6503" //wss is secure websocket 

var wsConnection = null;
var clientID = 0;

module.exports = {
    sendToServer,
    sendTextMessageToServer,
    connect
}

// Send a JavaScript object by converting it to JSON and sending
// it as a message on the WebSocket connection.
// like register
function sendToServer(msg) {
  var msgJSON = JSON.stringify(msg);

  log("Sending '" + msg.type + "' message: " + msgJSON);
  wsConnection.send(msgJSON);
}

// Handles a click on the Send button (or pressing return/enter) by
// building a "message" object and sending it to the server.
function sendTextMessageToServer(myText) {
    var msg = {
      text: myText,
      type: "message",
      id: clientID,
      date: Date.now()
    };
    sendToServer(msg);
  }

// Called when the "id" message is received; this message is sent by the
// server to assign this login session a unique ID number; in response,
// this function sends a "username" message to set our username for this
// session.
function setUsername(myUsername) {
    sendToServer({
        name: myUsername,
        date: Date.now(),
        id: clientID,
        type: "username"
    });
}

// Open and configure the wsConnection to the WebSocket server.
function connect(myUsername) {
    var scheme = "ws";  

    log(`Connecting to server: ${serverUrl}`);

    return new Promise(function(resolve, reject) {
        wsConnection = new WebSocket(serverUrl, {
            protocol:"json",
            // protocolVersion: 8,
            // origin: 'https://localhost:6503',
            rejectUnauthorized: false
          });

        wsConnection.onopen = function() {
            log("wsConnection.onOpen")
        };
        wsConnection.onerror = function(err) {
            console.log('wsConnection.onerror : %o', evt);
            reject(err);
        };

        wsConnection.onmessage = function(evt) {
            var text = "";
            var msg = JSON.parse(evt.data);
            log("Message received: ");
            console.dir(msg);
            var time = new Date(msg.date);
            var timeStr = time.toLocaleTimeString();

            switch(msg.type) {
                case "id":
                clientID = msg.id;
                setUsername(myUsername);
                break;

                case "username":
                text = "<b>User <em>" + msg.name + "</em> signed in at " + timeStr + "</b><br>";

                resolve(wsConnection);
                break;

                case "message":
                text = "(" + timeStr + ") <b>" + msg.name + "</b>: " + msg.text + "<br>";
                break;

                case "rejectusername":
                myUsername = msg.name;
                text = "<b>Your username has been set to <em>" + myUsername +
                    "</em> because the name you chose is in use.</b><br>";
                break;

                case "userlist":      // Received an updated user list
                //handleUserlistMsg(msg);
                break;

                // Signaling messages: these messages are used to trade WebRTC
                // signaling information during negotiations leading up to a video
                // call.

                case "video-offer":  // Invitation and offer to chat
                handleVideoOfferMsg(msg);
                break;

                case "video-answer":  // Callee has answered our offer
                handleVideoAnswerMsg(msg);
                break;

                case "new-ice-candidate": // A new ICE candidate has been received
                handleNewICECandidateMsg(msg);
                break;

                case "hang-up": // The other peer has hung up the call
                handleHangUpMsg(msg);
                break;

                // Unknown message; output to console for debugging.

                default:
                log_error("Unknown message received:");
                log_error(msg);
            }

            // If there's text to insert into the chat buffer, do so now, then
            // scroll the chat panel so that the new text is visible.

            if (text.length) {
                log(text)
            }
        };
    });

}




// A new ICE candidate has been received from the other peer. Call
// RTCPeerConnection.addIceCandidate() to send it along to the
// local ICE framework.

async function handleNewICECandidateMsg(msg) {
    var candidate = new RTCIceCandidate(msg.candidate);
  
    log("*** Adding received ICE candidate: " + JSON.stringify(candidate));
    try {
      await myPeerConnection.addIceCandidate(candidate)
    } catch(err) {
      reportError(err);
    }
  }


// Responds to the "video-answer" message sent to the caller
// once the callee has decided to accept our request to talk.

async function handleVideoAnswerMsg(msg) {
    log("*** Call recipient has accepted our call");
  
    // Configure the remote description, which is the SDP payload
    // in our "video-answer" message.
  
    var desc = new RTCSessionDescription(msg.sdp);
    await myPeerConnection.setRemoteDescription(desc).catch(reportError);
  }


// Accept an offer to video chat. We configure our local settings,
// create our RTCPeerConnection, get and attach our local camera
// stream, then create and send an answer to the caller.

async function handleVideoOfferMsg(msg) {
  targetUsername = msg.name;

  // If we're not already connected, create an RTCPeerConnection
  // to be linked to the caller.

  log("Received video chat offer from " + targetUsername);
  if (!myPeerConnection) {
    createPeerConnection();
  }

  // We need to set the remote description to the received SDP offer
  // so that our local WebRTC layer knows how to talk to the caller.

  var desc = new RTCSessionDescription(msg.sdp);

  // If the wsConnection isn't stable yet, wait for it...

  if (myPeerConnection.signalingState != "stable") {
    log("  - But the signaling state isn't stable, so triggering rollback");

    // Set the local and remove descriptions for rollback; don't proceed
    // until both return.
    await Promise.all([
      myPeerConnection.setLocalDescription({type: "rollback"}),
      myPeerConnection.setRemoteDescription(desc)
    ]);
    return;
  } else {
    log ("  - Setting remote description");
    await myPeerConnection.setRemoteDescription(desc);
  }

  // Get the webcam stream if we don't already have it

  if (!webcamStream) {
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    } catch(err) {
      handleGetUserMediaError(err);
      return;
    }

    document.getElementById("local_video").srcObject = webcamStream;

    // Add the camera stream to the RTCPeerConnection

    try {
      webcamStream.getTracks().forEach(
        transceiver = track => myPeerConnection.addTransceiver(track, {streams: [webcamStream]})
      );
    } catch(err) {
      handleGetUserMediaError(err);
    }
  }

  log("---> Creating and sending answer to caller");

  await myPeerConnection.setLocalDescription(await myPeerConnection.createAnswer());

  sendToServer({
    name: myUsername,
    target: targetUsername,
    type: "video-answer",
    sdp: myPeerConnection.localDescription
  });
}


// Output logging information to console.

function log(text) {
    var time = new Date();
  
    console.log("[" + time.toLocaleTimeString() + "] " + text);
  }
  
  // Output an error message to console.
  
  function log_error(text) {
    var time = new Date();
  
    console.trace("[" + time.toLocaleTimeString() + "] " + text);
  }