# Mazzado Subscription Flow & Permission Rules Test Checklist

This checklist guarantees zero-regression, zero-privilege-escalation, and secure subscription flows from end-to-end.

---

## 🔑 Phase 1: User Registration & Initial Database State

- [ ] **1. Sign Up a New User**:
  - Open the register screen in the app.
  - Fill out a brand-new email (e.g., `tester@example.com`), password, and optional phone number.
  - Click Register.
- [ ] **2. Auth Identity Verification**:
  - Verify that the user is registered in **Firebase Authentication**.
- [ ] **3. Document Creation**:
  - Verify that a Firestore document has been created under `users/{uid}` matching the authenticated user's `uid`.
- [ ] **4. Core Privilege Defaults**:
  - Verify that `role` is strictly set to `"user"`.
  - Verify that `isAdmin` is strictly set to `false`.
  - Verify that `accountStatus` is strictly set to `"active"`.
  - Verify that `subscriptionStatus` is strictly set to `"none"`.
- [ ] **5. Wallet Allocation**:
  - Verify that a document inside the `wallets` collection is created for this `uid` with zero balance.
  - **CRITICAL**: The wallet must be created safely server-side (via the `onUserCreated` Auth trigger cloud function), rather than written directly from client UI logic.

---

## 💳 Phase 2: Premium Subscription Purchase Flow

- [ ] **1. Log In as standard user**:
  - Authenticate using the newly created credentials (`tester@example.com`).
- [ ] **2. Initiate Subscription**:
  - Navigate to the subscription drawer/modal and choose a plan (e.g., Monthly).
- [ ] **3. Payment Verification Upload**:
  - Upload a mockup payment proof screenshot.
- [ ] **4. Blob/Base64 Check**:
  - **CRITICAL**: Verify that the Base64 image data-URI is completely stripped and uploaded to **Firebase Storage** under the path:
    `payment-proofs/{userId}/{timestamp}_proof.png`
  - Verify that Firestore **never** stores Base64 string data.
- [ ] **5. Request Registration**:
  - Confirm that a document is generated in `/subscriptionRequests/{id}` with `subscriptionStatus: "pending"`.
- [ ] **6. User Document Sync**:
  - Confirm that the `users/{userId}` document is safely updated with:
    - `subscriptionStatus: "pending"`
    - `subscriptionPlan` matching the selection
    - `paymentProofUrl` pointing to the secure Firebase Storage download URL.

---

## 🛡️ Phase 3: Administrative Verification & Dashboard Controls

- [ ] **1. Authenticate as Verified Admin**:
  - Log in using the strict admin email `admaaqaba06@gmail.com`.
- [ ] **2. UI Gating Rules**:
  - Verify that the **Admin Dashboard** option is only visible for `admaaqaba06@gmail.com`.
  - Verify that if you log in with *any other account*, the Admin tab is completely hidden and inaccessible.
- [ ] **3. Subscription Request Tracking**:
  - Open **Pending Subscription Requests** inside the Admin view.
  - Verify that the newly created user's request appears with all uploaded payment details and transfer metadata.
- [ ] **4. Badge Counter Accuracy**:
  - Verify that the sidebar notification badge reflects the exact number of pending requests.
- [ ] **5. Receipt Preview**:
  - Verify that clicking the receipt image successfully opens the full high-res secure Storage preview of the payment proof.
- [ ] **6. Action Permissions**:
  - Verify that you can click **Approve** or **Reject** without permission errors.

---

## ✅ Phase 4: Resolution Flow Outcomes (Approve vs Reject)

### Scenario A: Approving a Subscription Request
- [ ] **1. Request Record State**:
  - Confirm `subscriptionRequests/{id}.subscriptionStatus` transitions to `"approved"`.
- [ ] **2. User Profile Transition**:
  - Confirm `users/{userId}.subscriptionStatus` transitions to `"active"`.
- [ ] **3. Approval Audit Timestamp**:
  - Confirm `subscriptionApprovedAt` is stored via `serverTimestamp()`.
- [ ] **4. Expiry Calculation**:
  - Confirm `subscriptionExpiresAt` is computed correctly based on the plan duration:
    - **Monthly**: Current time + 30 days
    - **Quarterly**: Current time + 90 days
    - **Yearly/Annual**: Current time + 365 days

### Scenario B: Rejecting a Subscription Request
- [ ] **1. Request Record State**:
  - Confirm `subscriptionRequests/{id}.subscriptionStatus` transitions to `"rejected"`.
- [ ] **2. User Profile Transition**:
  - Confirm `users/{userId}.subscriptionStatus` transitions to `"rejected"`.
- [ ] **3. Retry Safeguard**:
  - Log back in as the rejected user and verify they can easily submit a new payment proof screenshot later to re-initiate the subscription flow.
