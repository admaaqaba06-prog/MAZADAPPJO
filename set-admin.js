/**
 * Script: set-admin.js
 * Purpose: Local Node.js Firebase Admin script to assign Custom User Claims (admin: true, role: 'admin') and update Firestore.
 * 
 * Usage:
 *   1. Download your Firebase service account key from the Firebase Console (Project Settings -> Service Accounts -> Generate New Private Key).
 *   2. Save the downloaded JSON file in this directory as `service-account.json`.
 *   3. Run the following commands:
 *      npm install firebase-admin
 *      node set-admin.js <YOUR_USER_UID>
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Get UID from command line argument
const uid = process.argv[2];

if (!uid) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error: Please provide the User UID.');
  console.error('Usage: node set-admin.js <USER_UID>');
  process.exit(1);
}

const serviceAccountPath = path.join(__dirname, 'service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error: "service-account.json" not found!');
  console.error('Please download your Firebase Service Account private key JSON file, rename it to "service-account.json" and place it in the same directory as this script.');
  process.exit(1);
}

// Initialize the Admin SDK
console.log('🔄 Initializing Firebase Admin SDK...');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();
const db = admin.firestore();

async function grantAdmin(userUid) {
  try {
    // 1. Fetch user to confirm they exist
    console.log(`🔍 Checking user in Auth with UID: ${userUid}...`);
    const user = await auth.getUser(userUid);
    console.log(`✅ Found user: ${user.displayName || 'No Name'} (${user.email})`);

    // 2. Set Custom User Claims
    console.log('⚡ Setting custom claims: { admin: true, role: "admin" }...');
    await auth.setCustomUserClaims(userUid, {
      admin: true,
      role: 'admin'
    });
    console.log('✅ Custom claims successfully set!');

    // 3. Update their Firestore User Document to match
    console.log('📄 Updating user document in Firestore `/users/' + userUid + '`...');
    const userDocRef = db.collection('users').doc(userUid);
    const userDoc = await userDocRef.get();
    
    if (userDoc.exists) {
      await userDocRef.update({
        role: 'admin',
        isVerified: true
      });
      console.log('✅ Firestore user document role updated to "admin"!');
    } else {
      console.log('💡 Note: Firestore user document did not exist yet; creating a placeholder Admin document...');
      await userDocRef.set({
        id: userUid,
        name: user.displayName || user.email.split('@')[0],
        email: user.email,
        role: 'admin',
        isVerified: true,
        isBlocked: false,
        subscriptionStatus: 'none',
        subscriptionExpiry: null,
        phoneNumber: '',
        city: '',
        wonCount: 0
      }, { merge: true });
      console.log('✅ Created administrative placeholder user doc.');
    }

    console.log('\n\x1b[32m%s\x1b[0m', '🎉 CONGRATULATIONS! User is now a fully powered administrator!');
    console.log('Have the user sign out and sign back in to apply the claim token changes.');
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', '❌ Failed to grant administration access:', error.message);
  }
}

grantAdmin(uid);
