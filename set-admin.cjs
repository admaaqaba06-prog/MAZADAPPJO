/**
 * Script: set-admin.cjs
 * Purpose: Local Node.js Firebase Admin script to assign Custom User Claims (admin: true, role: 'admin') and update Firestore.
 * 
 * Usage:
 *   1. Download your Firebase service account key from the Firebase Console (Project Settings -> Service Accounts -> Generate New Private Key).
 *   2. Save the downloaded JSON file in this directory as `service-account.json`.
 *   3. Run the following commands:
 *      npm install firebase-admin
 *      node set-admin.cjs <YOUR_USER_UID>
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Get UID from command line argument
const uid = process.argv[2];

if (!uid) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error: Please provide the User UID.');
  console.error('Usage: node set-admin.cjs <USER_UID>');
  process.exit(1);
}

let serviceAccountPath = path.join(__dirname, 'service-account.json');

// Windows hidden extensions support: Check if service-account.json.json exists
if (!fs.existsSync(serviceAccountPath)) {
  const doubleJsonPath = path.join(__dirname, 'service-account.json.json');
  if (fs.existsSync(doubleJsonPath)) {
    console.log('💡 Note: Detected "service-account.json.json" (caused by Windows hiding file extensions), using it...');
    serviceAccountPath = doubleJsonPath;
  }
}

// Still not found? Let's check if there is any file containing 'service' and 'account' in its name (e.g., service-account.json, service-account (2).json, etc.)
if (!fs.existsSync(serviceAccountPath)) {
  try {
    const files = fs.readdirSync(__dirname);
    const matchedFile = files.find(f => {
      const lower = f.toLowerCase();
      return lower.includes('service') && lower.includes('account');
    });
    if (matchedFile) {
      console.log(`💡 Note: Found nearby service account file named "${matchedFile}", using it...`);
      serviceAccountPath = path.join(__dirname, matchedFile);
    }
  } catch (e) {
    // Ignore error
  }
}

if (!fs.existsSync(serviceAccountPath)) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error: "service-account.json" not found!');
  console.error('Please download your Firebase Service Account private key JSON file, rename it to "service-account.json" and place it in the same directory as this script.');
  console.error('\n💡 Windows Tip: Windows might have hidden the actual extension, so your file might actually be named "service-account.json.json" or "service-account". Make sure the file exists in your project directory.');
  process.exit(1);
}

// Initialize the Admin SDK
console.log('🔄 Initializing Firebase Admin SDK...');

let serviceAccount;
try {
  const rawData = fs.readFileSync(serviceAccountPath, 'utf8');
  // Clean potential UTF-8 BOM characters that often happen in Windows text files
  const cleanData = rawData.replace(/^\uFEFF/, '');
  serviceAccount = JSON.parse(cleanData);
} catch (parseError) {
  console.error('\x1b[31m%s\x1b[0m', `❌ Error reading or parsing "${path.basename(serviceAccountPath)}"!`);
  console.error('Details:', parseError.message);
  console.error('Please make sure you downloaded the complete, valid private key JSON file from your Firebase console, and that it has not been modified or corrupted.');
  process.exit(1);
}

// Resolve the actual admin object to handle ESM/CJS interop safely
const firebaseAdmin = admin && admin.credential ? admin : ((admin && admin.default) || admin);

if (!firebaseAdmin || !firebaseAdmin.credential) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error: Failed to load Firebase Admin SDK properties correctly.');
  console.error('This usually happens due to Node.js module interop issues. Please make sure "firebase-admin" is installed.');
  process.exit(1);
}

firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount)
});

const auth = firebaseAdmin.auth();
const db = firebaseAdmin.firestore();

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
