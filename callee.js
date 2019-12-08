const signalingServer = require('./wss.js')
const webrtcConnection = require('./connection.js')


var myUsername = process.argv[2]


async function sleep(msec) {
    return new Promise(resolve => setTimeout(resolve, msec));
}

const wait = async function() {
    console.log("Waiting for 60 second...");
    await sleep(60000);
    console.log("Waiting done."); // Called 5 second after the first console.log
}



signalingServer.connect(myUsername)
.then(function(server) {
    // signal server is connected
    wait()
}).catch(function(err) {
    // error here
});


