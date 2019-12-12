'use strict';

const chatClient = require('./chatclient.js')

async function connectToWebSocketServer(myName) {
    await chatClient.connect(myName);
    console.log("Connected to web socket server.");
}

async function call(targetUserName) {
    await chatClient.invite(targetUserName);
}

async function connectAndCall(myName, targetUserName) {
    await chatClient.connect(myName);
    console.log("----------------- onnected to web socket server.");

    await chatClient.invite(targetUserName);
    console.log("---------------- Established P2P.");

    chatClient.sendMessage("Greeting from C1 ~");
}

// connectToWebSocketServer("C1")
// call("Skyroam01")
connectAndCall("C1", "Skyroam01")
