const firebase = require("firebase-admin");
const serviceAccount = require('./firebase.json')
firebase.initializeApp({
    credential: firebase.credential.cert(serviceAccount),
});
module.exports = { firebase }