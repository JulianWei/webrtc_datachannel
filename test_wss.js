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

var myUsername = "julia"
signalingServer.connect(myUsername)
.then(function(server) {
    // signal server is connected
    signalingServer.sendTextMessageToServer("hello")
    wait()
}).catch(function(err) {
    // error here
});

// const WebSocket = require('ws');

// const ws = new WebSocket('wss://localhost:6503',
//     { rejectUnauthorized: false,
//         protocol: "json" });

// ws.on('open', function open() {
//     console.log("opened");
//   ws.send('something');

//   console.log("sent message something");
// });

// ws.on('message', function incoming(data) {
//   console.log(data);
// });


