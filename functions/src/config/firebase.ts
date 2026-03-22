import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
// In Cloud Functions, this auto-detects credentials
admin.initializeApp();

export const db = admin.firestore();
export const auth = admin.auth();
export const messaging = admin.messaging();
export const storage = admin.storage();

export default admin;
