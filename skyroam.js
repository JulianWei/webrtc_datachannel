'use strict';

const chatClient = require('./chatclient.js')

async function connectToWebSocketServer(userName) {
    await chatClient.connect(userName)
    console.log("Connected to web socket server.")
}

connectToWebSocketServer("Skyroam01")