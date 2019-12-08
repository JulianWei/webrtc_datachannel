'use strict';
const  wrtc = require('wrtc');
var RTCPeerConnection = wrtc.RTCPeerConnection;
var RTCSessionDescription = wrtc.RTCSessionDescription;
var RTCIceCandidate = wrtc.RTCIceCandidate;

module.exports = {
    call
}

var signalingServer = null
var myPeerConnection = null;    // RTCPeerConnection
var myUsername = null
var targetUsername = null


// Handle a click on an item in the user list by inviting the clicked
// user to video chat. Note that we don't actually send a message to
// the callee here -- calling RTCPeerConnection.addTrack() issues
// a |notificationneeded| event, so we'll let our handler for that
// make the offer.

async function call(myName, calle, sServer) {
    myUsername = myName;
    targetUsername = calle;
    signalingServer = sServer;

    log("Starting to prepare an invitation");
    if (myPeerConnection) {
      log("You can't start a call because you already have one open!");
    } else {
      // Don't allow users to call themselves, because weird.
  
      if (calle === myUsername) {
        log("I'm afraid I can't let you talk to yourself. That would be weird.");
        return;
      }
  
      // Record the username being called for future reference
  
      targetUsername = calle;
      log("Calling user " + targetUsername);
  
      // Call createPeerConnection() to create the RTCPeerConnection.
      // When this returns, myPeerConnection is our RTCPeerConnection
      // and webcamStream is a stream coming from the camera. They are
      // not linked together in any way yet.
  
      log("Setting up connection to call user: " + targetUsername);
      createPeerConnection();
  
      
    // 2. Create the data channel and establish its event listeners
    var sendChannel = myPeerConnection.createDataChannel('sendChannel');
    console.log('Created sendChannel');
    sendChannel.onopen = handleSendChannelStatusChange;
    sendChannel.onclose = handleSendChannelStatusChange;  

    // TODO: Now create an offer to connect; this starts the process
    // myPeerConnection.createOffer()
    // .then(offer => pc.setLocalDescription(offer))
    // .catch(handleCreateDescriptionError);  
  
    //   // Add the tracks from the stream to the RTCPeerConnection
  
    //   try {
    //     webcamStream.getTracks().forEach(
    //       transceiver = track => myPeerConnection.addTransceiver(track, {streams: [webcamStream]})
    //     );
    //   } catch(err) {
    //     handleGetUserMediaError(err);
    //   }
    }
  }


// Create the RTCPeerConnection which knows how to talk to our
// selected STUN/TURN server and then uses getUserMedia() to find
// our camera and microphone and add that stream to the connection for
// use in our video call. Then we configure event handlers to get
// needed notifications on the call.

async function createPeerConnection() {
    log("Setting up a connection...");
    // 1. Create an RTCPeerConnection which knows to use our chosen STUN server.
    myPeerConnection = new RTCPeerConnection({
        iceServers: [
          {
            urls: ['stun:stun.l.google.com:19302']
          }
        ]
      });
    console.log('Created local peer connection object pc');

    // 2. Set up event handlers for the ICE negotiation process.
    myPeerConnection.onicecandidate = handleICECandidateEvent;
    myPeerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
    myPeerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
    myPeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
    myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;

  
}

// Called by the WebRTC layer to let us know when it's time to
// begin, resume, or restart ICE negotiation.

async function handleNegotiationNeededEvent() {
    log("*** Negotiation needed");
  
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
      signalingServer.sendToServer({
        name: myUsername,
        target: targetUsername,
        type: "video-offer",
        sdp: myPeerConnection.localDescription
      });
    } catch(err) {
      log("*** The following error occurred while handling the negotiationneeded event:");
      log_error(err);
    };
  }


// Handles |icecandidate| events by forwarding the specified
// ICE candidate (created by our local ICE agent) to the other
// peer through the signaling server.

function handleICECandidateEvent(event) {
    if (event.candidate) {
      log("*** Outgoing ICE candidate: " + event.candidate.candidate);
  
      signalingServer.sendToServer({
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
// Send a message to the remote peer.
function sendMessage() {
    var message = messageInputBox.value;
    sendChannel.send(message);
}

// Handle errors attempting to create a description;
// this can happen both when creating an offer and when
// creating an answer. In this simple example, we handle
// both the same way.
function handleCreateDescriptionError(error) {
    console.log("Unable to create an offer: " + error.toString());
}

// Handle successful addition of the ICE candidate
// on the "local" end of the connection.
function handleLocalAddCandidateSuccess() {
    console.log("handleLocalAddCandidateSuccess");
}



// Handle status changes on the local end of the data
// channel; this is the end doing the sending of data
// in this example.
function handleSendChannelStatusChange(event) {
    if (sendChannel) {
        var state = sendChannel.readyState;

        if (state === "open") {
        console.log("handleSendChannelStatusChange state==open");
        } else {
        console.log("handleSendChannelStatusChange state!=open");
        }
    }
}


// Close the RTCPeerConnection and reset variables so that the user can
// make or receive another call if they wish. This is called both
// when the user hangs up, the other user hangs up, or if a connection
// failure is detected.

function closeVideoCall() {
    var localVideo = document.getElementById("local_video");
  
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
  
      // Stop all transceivers on the connection
  
      myPeerConnection.getTransceivers().forEach(transceiver => {
        transceiver.stop();
      });
  
      // Stop the webcam preview as well by pausing the <video>
      // element, then stopping each of the getUserMedia() tracks
      // on it.
  
      if (localVideo.srcObject) {
        localVideo.pause();
        localVideo.srcObject.getTracks().forEach(track => {
          track.stop();
        });
      }
  
      // Close the peer connection
  
      myPeerConnection.close();
      myPeerConnection = null;
      webcamStream = null;
    }
  
    // Disable the hangup button
  
    document.getElementById("hangup-button").disabled = true;
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
  
    signalingServer.sendToServer({
      name: myUsername,
      target: targetUsername,
      type: "hang-up"
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