'use strict';
const signalingServer = require('./wss.js')

async function sleep(msec) {
    return new Promise(resolve => setTimeout(resolve, msec));
}

const wait = async function() {
    console.log("Waiting for 15 second...");
    await sleep(60000);
    console.log("Waiting done."); // Called 5 second after the first console.log
}

var myUsername = "bob"
signalingServer.connect(myUsername)
.then(function(server) {
    // signal server is connected
    //signalingServer.sendTextMessageToServer("hello")
    wait()
}).catch(function(err) {
    // error here
});


