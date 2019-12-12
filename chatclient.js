// WebSocket and WebRTC based multi-user chat sample with two-way video
// calling, including use of TURN if applicable or necessary.
//
// This file contains the JavaScript code that implements the client-side
// features for connecting and managing chat and video calls.
//
// To read about how this sample works:  http://bit.ly/webrtc-from-chat
//
// Any copyright is dedicated to the Public Domain.
// http://creativecommons.org/publicdomain/zero/1.0/

"use strict";

module.exports = {
  connect,
  invite,
  sendMessage
}

const WebSocket = require('ws');
const serverUrl = "wss://localhost:6503" //wss is secure websocket 

const  wrtc = require('wrtc');
var RTCPeerConnection = wrtc.RTCPeerConnection;
var RTCSessionDescription = wrtc.RTCSessionDescription;
var RTCIceCandidate = wrtc.RTCIceCandidate;



// Get our hostname

var myHostname = null;
if (!myHostname) {
  myHostname = "localhost";
}
log("Hostname: " + myHostname);

// WebSocket chat/signaling channel variables.

var connection = null;
var clientID = 0;

var myUsername = null
var targetUsername = null;      // To store username of other peer
var myPeerConnection = null;    // RTCPeerConnection
var dataChannel = null;

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

// Send a JavaScript object by converting it to JSON and sending
// it as a message on the WebSocket connection.

function sendToServer(msg) {
  var msgJSON = JSON.stringify(msg);

  log("Sending '" + msg.type + "' message: " + msgJSON);
  connection.send(msgJSON);
}

// Called when the "id" message is received; this message is sent by the
// server to assign this login session a unique ID number; in response,
// this function sends a "username" message to set our username for this
// session.
function setUsername() {
  sendToServer({
    name: myUsername,
    date: Date.now(),
    id: clientID,
    type: "username"
  });
}

// Open and configure the connection to the WebSocket server.

function connect(userName) {

  log(`Connecting to server: ${serverUrl}`);
  myUsername = userName;

  return new Promise(function(resolve, reject) {
    connection = new WebSocket(serverUrl, {
      protocol:"json",
      // protocolVersion: 8,
      // origin: 'https://localhost:6503',
      rejectUnauthorized: false
    });


    connection.onopen = function(evt) {
      log("wsConnection.onOpen")
    };

    connection.onerror = function(evt) {
      console.log('wsConnection.onerror : %o', evt);
      reject(evt);
    }

    connection.onmessage = function(evt) {
      var text = "";
      var msg = JSON.parse(evt.data);
      log("Message received: ");
      console.dir(msg);
      var time = new Date(msg.date);
      var timeStr = time.toLocaleTimeString();

      switch(msg.type) {
        case "id":
          clientID = msg.id;
          setUsername();
          break;

        case "username":
          text = "<b>User <em>" + msg.name + "</em> signed in at " + timeStr + "</b><br>";
          
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
          resolve(connection);
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

      //TODO: maybe process normal messages from websocket server 
    };
  });
}

// ------------ WebRTC world begins ------
// Create the RTCPeerConnection which knows how to talk to our
// selected STUN/TURN server and then uses getUserMedia() to find
// our camera and microphone and add that stream to the connection for
// use in our video call. Then we configure event handlers to get
// needed notifications on the call.

async function createPeerConnection() {
  log("Setting up a connection...");

  // Create an RTCPeerConnection which knows to use our chosen
  // STUN server.

  myPeerConnection = new RTCPeerConnection({
    iceServers: [     // Information about ICE servers - Use your own!
      {
        urls: ['stun:stun.l.google.com:19302']
        // urls: "turn:" + myHostname,  // A TURN server
        // username: "webrtc",
        // credential: "turnserver"
      }
    ]
  });

  // Set up event handlers for the ICE negotiation process.

  // myPeerConnection.onicecandidate is called when myself's ice candidate (reflected ip) is found out by webrtc framework 
  myPeerConnection.onicecandidate = handleICECandidateEvent;
  myPeerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
  myPeerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
  myPeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
  myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;
  myPeerConnection.ontrack = handleTrackEvent;
}

// Called by the WebRTC layer to let us know when it's time to
// begin, resume, or restart ICE negotiation.

async function handleNegotiationNeededEvent() {
  log("*** Negotiation needed");
}

async function createAndSendOffer() {

  try {
    log("---> Creating offer");
    const offer = await myPeerConnection.createOffer();

    // If the connection hasn't yet achieved the "stable" state,
    // return to the caller. Another negotiationneeded event
    // will be fired when the state stabilizes.

    if (myPeerConnection.signalingState != "stable") {
      log("     -- The connection isn't stable yet; postponing...")
      return;
    }

    // Establish the offer as the local peer's current
    // description.

    log("---> Setting local description to the offer");
    await myPeerConnection.setLocalDescription(offer);

    // Send the offer to the remote peer.

    log("---> Sending the offer to the remote peer");
    sendToServer({
      name: myUsername,
      target: targetUsername,
      type: "video-offer",
      sdp: myPeerConnection.localDescription
    });
  } catch(err) {
    log("*** The following error occurred while handling the negotiationneeded event:");
    reportError(err);
  };
}

// Called by the WebRTC layer when events occur on the media tracks
// on our WebRTC call. This includes when streams are added to and
// removed from the call.
//
// track events include the following fields:
//
// RTCRtpReceiver       receiver
// MediaStreamTrack     track
// MediaStream[]        streams
// RTCRtpTransceiver    transceiver
//
// In our case, we're just taking the first stream found and attaching
// it to the <video> element for incoming media.

function handleTrackEvent(event) {
  log("*** Track event");
  document.getElementById("received_video").srcObject = event.streams[0];
  document.getElementById("hangup-button").disabled = false;
}

// Handles |icecandidate| events by forwarding the specified
// ICE candidate (created by our local ICE agent) to the other
// peer through the signaling server.

function handleICECandidateEvent(event) {
  if (event.candidate) {
    log("*** Outgoing ICE candidate: " + event.candidate.candidate);

    sendToServer({
      type: "new-ice-candidate",
      target: targetUsername,
      candidate: event.candidate
    });
  }
}

// Handle |iceconnectionstatechange| events. This will detect
// when the ICE connection is closed, failed, or disconnected.
//
// This is called when the state of the ICE agent changes.

function handleICEConnectionStateChangeEvent(event) {
  log("*** ICE connection state changed to " + myPeerConnection.iceConnectionState);

  switch(myPeerConnection.iceConnectionState) {
    case "closed":
    case "failed":
    case "disconnected":
      closeVideoCall();
      break;
  }
}

// Set up a |signalingstatechange| event handler. This will detect when
// the signaling connection is closed.
//
// NOTE: This will actually move to the new RTCPeerConnectionState enum
// returned in the property RTCPeerConnection.connectionState when
// browsers catch up with the latest version of the specification!

function handleSignalingStateChangeEvent(event) {
  log("*** WebRTC signaling state changed to: " + myPeerConnection.signalingState);
  switch(myPeerConnection.signalingState) {
    case "closed":
      closeVideoCall();
      break;
  }
}

// Handle the |icegatheringstatechange| event. This lets us know what the
// ICE engine is currently working on: "new" means no networking has happened
// yet, "gathering" means the ICE engine is currently gathering candidates,
// and "complete" means gathering is complete. Note that the engine can
// alternate between "gathering" and "complete" repeatedly as needs and
// circumstances change.
//
// We don't need to do anything when this happens, but we log it to the
// console so you can see what's going on when playing with the sample.

function handleICEGatheringStateChangeEvent(event) {
  log("*** ICE gathering state changed to: " + myPeerConnection.iceGatheringState);
}


// Close the RTCPeerConnection and reset variables so that the user can
// make or receive another call if they wish. This is called both
// when the user hangs up, the other user hangs up, or if a connection
// failure is detected.

function closeVideoCall() {
  //var localVideo = document.getElementById("local_video");

  log("Closing the call");

  // Close the RTCPeerConnection

  if (myPeerConnection) {
    log("--> Closing the peer connection");

    // Disconnect all our event listeners; we don't want stray events
    // to interfere with the hangup while it's ongoing.

    myPeerConnection.ontrack = null;
    myPeerConnection.onnicecandidate = null;
    myPeerConnection.oniceconnectionstatechange = null;
    myPeerConnection.onsignalingstatechange = null;
    myPeerConnection.onicegatheringstatechange = null;
    myPeerConnection.onnotificationneeded = null;

    // TODO: close datachannel
    log("--> Closing data channel");
    dataChannel.close()
    
    // Stop all transceivers on the connection

    // myPeerConnection.getTransceivers().forEach(transceiver => {
    //   transceiver.stop();
    // });

    // // Stop the webcam preview as well by pausing the <video>
    // // element, then stopping each of the getUserMedia() tracks
    // // on it.

    // if (localVideo.srcObject) {
    //   localVideo.pause();
    //   localVideo.srcObject.getTracks().forEach(track => {
    //     track.stop();
    //   });
    // }

    // Close the peer connection

    myPeerConnection.close();
    myPeerConnection = null;
    webcamStream = null;
  }

  targetUsername = null;
}

// Handle the "hang-up" message, which is sent if the other peer
// has hung up the call or otherwise disconnected.

function handleHangUpMsg(msg) {
  log("*** Received hang up notification from other peer");

  closeVideoCall();
}

// Hang up the call by closing our end of the connection, then
// sending a "hang-up" message to the other peer (keep in mind that
// the signaling is done on a different connection). This notifies
// the other peer that the connection should be terminated and the UI
// returned to the "no call in progress" state.

function hangUpCall() {
  closeVideoCall();

  sendToServer({
    name: myUsername,
    target: targetUsername,
    type: "hang-up"
  });
}

// Handle a click on an item in the user list by inviting the clicked
// user to video chat. Note that we don't actually send a message to
// the callee here -- calling RTCPeerConnection.addTrack() issues
// a |notificationneeded| event, so we'll let our handler for that
// make the offer.

async function invite(clickedUsername) {
  log("Starting to prepare an invitation");
  if (myPeerConnection) {
    alert("You can't start a call because you already have one open!");
  } else {
    // Don't allow users to call themselves, because weird.

    if (clickedUsername === myUsername) {
      alert("I'm afraid I can't let you talk to yourself. That would be weird.");
      return;
    }

    // Record the username being called for future reference

    targetUsername = clickedUsername;
    log("Inviting user " + targetUsername);

    // Call createPeerConnection() to create the RTCPeerConnection.
    // When this returns, myPeerConnection is our RTCPeerConnection
    // and webcamStream is a stream coming from the camera. They are
    // not linked together in any way yet.

    log("Setting up connection to invite user: " + targetUsername);
    createPeerConnection();

    // Get access to the webcam stream and attach it to the
    // "preview" box (id "local_video").

    // try {
    //   webcamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    //   document.getElementById("local_video").srcObject = webcamStream;
    // } catch(err) {
    //   handleGetUserMediaError(err);
    //   return;
    // }

    // // Add the tracks from the stream to the RTCPeerConnection

    // try {
    //   webcamStream.getTracks().forEach(
    //     transceiver = track => myPeerConnection.addTransceiver(track, {streams: [webcamStream]})
    //   );
    // } catch(err) {
    //   handleGetUserMediaError(err);
    // }

    await createAndSendOffer();

    // TODO create data channel
    // Create the data channel and establish its event listeners
    dataChannel = myPeerConnection.createDataChannel('dataChannel');
    console.log('Created dataChannel');
    dataChannel.onclose = handleSendChannelStatusChange;  
    dataChannel.onmessage = handleDataChannelMessage;
    dataChannel.onopen = handleSendChannelStatusChange;
  }
}

// Send a message to the remote peer.
function sendMessage(message) {
  dataChannel.send(message);
}

async function handleDataChannelMessage(event) {
  log("!!!! DataChannel received message: " + event.data)
}

// Handle status changes on the local end of the data
// channel; this is the end doing the sending of data
// in this example.
async function handleSendChannelStatusChange(event) {
  if (dataChannel) {
      var state = dataChannel.readyState;

      if (state === "open") {
        console.log("handleSendChannelStatusChange state==open");
      } else {
        console.log("handleSendChannelStatusChange state!=open");
      }
  }
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

  // If the connection isn't stable yet, wait for it...

  if (myPeerConnection.signalingState != "stable") {
    log("  - But the signaling state isn't stable, so triggering rollback");

    log("  - signalingState:" + myPeerConnection.signalingState);

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

  // if (!webcamStream) {
  //   try {
  //     webcamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
  //   } catch(err) {
  //     handleGetUserMediaError(err);
  //     return;
  //   }

  //   document.getElementById("local_video").srcObject = webcamStream;

  //   // Add the camera stream to the RTCPeerConnection

  //   try {
  //     webcamStream.getTracks().forEach(
  //       transceiver = track => myPeerConnection.addTransceiver(track, {streams: [webcamStream]})
  //     );
  //   } catch(err) {
  //     handleGetUserMediaError(err);
  //   }
  // }


  log("---> Creating and sending answer to caller");

  await myPeerConnection.setLocalDescription(await myPeerConnection.createAnswer());

  sendToServer({
    name: myUsername,
    target: targetUsername,
    type: "video-answer",
    sdp: myPeerConnection.localDescription
  });

  // TODO: create data channel
  // The remote end is set up similarly, except that we don't need to explicitly create an RTCDataChannel ourselves, 
  // since we're going to be connected through the channel established above. Instead, we set up a datachannel event handler; 
  // this will be called when the data channel is opened; this handler will receive an RTCDataChannel object; 
  myPeerConnection.ondatachannel = receiveChannelCallback; 
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

function receiveChannelCallback(event) {
  dataChannel = event.channel;
  dataChannel.onmessage = handleReceiveMessage;
  dataChannel.onopen = handleReceiveChannelStatusChange;
  dataChannel.onclose = handleReceiveChannelStatusChange;
}

function handleReceiveChannelStatusChange(event) {
  if (receiveChannel) {
    console.log("Receive channel's status has changed to " +
                receiveChannel.readyState);
  }
}

function handleReceiveMessage(event) {
  console.log("~~~~~~~~~~Receive message!" + event.data);
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

// Handle errors which occur when trying to access the local media
// hardware; that is, exceptions thrown by getUserMedia(). The two most
// likely scenarios are that the user has no camera and/or microphone
// or that they declined to share their equipment when prompted. If
// they simply opted not to share their media, that's not really an
// error, so we won't present a message in that situation.

// function handleGetUserMediaError(e) {
//   log_error(e);
//   switch(e.name) {
//     case "NotFoundError":
//       alert("Unable to open your call because no camera and/or microphone" +
//             "were found.");
//       break;
//     case "SecurityError":
//     case "PermissionDeniedError":
//       // Do nothing; this is the same as the user canceling the call.
//       break;
//     default:
//       alert("Error opening your camera and/or microphone: " + e.message);
//       break;
//   }

//   // Make sure we shut down our end of the RTCPeerConnection so we're
//   // ready to try again.

//   closeVideoCall();
// }

// Handles reporting errors. Currently, we just dump stuff to console but
// in a real-world application, an appropriate (and user-friendly)
// error message should be displayed.

function reportError(errMessage) {
  log_error(`Error ${errMessage.name}: ${errMessage.message}`);
}
