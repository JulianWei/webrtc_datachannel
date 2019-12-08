const signalingServer = require('./wss.js')
const webrtcConnection = require('./connection.js')


var myUsername = process.argv[2]
var targetUsername = process.argv[3]


signalingServer.connect(myUsername)
.then(function(server) {
    // signal server is connected
    webrtcConnection.call(myUsername, targetUsername, signalingServer)
}).catch(function(err) {
    // error here
});

// async function connectToSigallingServer(myUsername) {
//     try {
//         await signalingServer.connect(myUsername)
//         // now signallingServer is connected
//     } catch (error) {
//         console.log("Error while connecting to sigalling server ", error)
//     }
//   };
// connectToSigallingServer(myUsername)
// call(targetUsername)