var firebase = require("firebase-admin");

var serviceAccount = require("/etc/secrets/firebase.json");

firebase.initializeApp({
    credential: firebase.credential.cert(serviceAccount)
});

module.exports = { firebase };
