# webrtc_datachannel
WebRtc clients chats over WebRtc data channel

Start signaling server
```
node signaling-server.js
```

Start Skyroam and client both as WebRtc clients
```
node skyroam.js
node client.js
```
client.js will send a hello message to skyroam via WebRtc datachannel.