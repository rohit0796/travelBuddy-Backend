const firebase = require("firebase-admin");
const serviceAccount = require('./firebase.json')
firebase.initializeApp({
    credential: firebase.credential.cert({
        type: "service_account",
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY,
        client_id: "102915423935978783168",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-psogf%40travelbuddy-6b633.iam.gserviceaccount.com",
        universe_domain: "googleapis.com"
    }),
});
module.exports = { firebase }