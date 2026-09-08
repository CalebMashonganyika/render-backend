const express = require('express');
const crypto = require('crypto');
const admin = require('firebase-admin');

const router = express.Router();
const CODE_TTL_MS = 10 * 60 * 1000;
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

function firebaseApp() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credential = raw
    ? admin.credential.cert(JSON.parse(raw))
    : admin.credential.applicationDefault();
  return admin.initializeApp({ credential });
}

function firestore() {
  return firebaseApp().firestore();
}

async function requireFirebaseUser(req, res, next) {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.substring('Bearer '.length).trim()
    : '';
  if (!token) {
    return res.status(401).json({ success: false, message: 'Firebase authentication required.' });
  }
  try {
    req.firebaseUser = await firebaseApp().auth().verifyIdToken(token);
    return next();
  } catch (error) {
    console.warn('Firebase token verification failed:', error.message);
    return res.status(401).json({ success: false, message: 'Invalid Firebase authentication token.' });
  }
}

function validName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80;
}

function newCode() {
  return String(crypto.randomInt(100000, 1000000));
}

router.post('/link-code', requireFirebaseUser, asyncHandler(async (req, res) => {
  const uid = req.firebaseUser.uid;
  const db = firestore();
  const businesses = await db.collection('businesses').where('ownerUid', '==', uid).limit(10).get();
  if (businesses.empty) {
    return res.status(403).json({ success: false, message: 'Only a business owner can generate a link code.' });
  }
  if (businesses.size !== 1) {
    return res.status(409).json({ success: false, message: 'Multiple Owner businesses are not supported.' });
  }

  const business = businesses.docs[0];
  const businessId = business.id;
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + CODE_TTL_MS);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newCode();
    const ref = db.collection('branchLinkCodes').doc(code);
    const existing = await ref.get();
    if (existing.exists && existing.data().expiresAt?.toMillis?.() > Date.now()) continue;
    await ref.set({
      businessId,
      ownerUid: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      used: false,
    });
    return res.json({ success: true, code, expiresAt: expiresAt.toDate().toISOString(), businessId });
  }
  return res.status(503).json({ success: false, message: 'Could not allocate a unique link code. Try again.' });
}));

router.post('/join', requireFirebaseUser, asyncHandler(async (req, res) => {
  const uid = req.firebaseUser.uid;
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const branchName = typeof req.body?.branchName === 'string' ? req.body.branchName.trim() : '';
  const branchId = typeof req.body?.branchId === 'string' ? req.body.branchId.trim() : '';
  if (!/^\d{6}$/.test(code) || !validName(branchName) || !branchId) {
    return res.status(400).json({ success: false, message: 'A valid code, branch name, and branch identity are required.' });
  }

  const db = firestore();
  const codeRef = db.collection('branchLinkCodes').doc(code);
  const userRef = db.collection('users').doc(uid);
  const result = await db.runTransaction(async (transaction) => {
    const codeDoc = await transaction.get(codeRef);
    if (!codeDoc.exists) throw new Error('INVALID_CODE');
    const link = codeDoc.data();
    if (link.used === true || !link.expiresAt || link.expiresAt.toMillis() <= Date.now()) {
      throw new Error('EXPIRED_CODE');
    }
    const businessId = link.businessId;
    const businessRef = db.collection('businesses').doc(businessId);
    const membershipRef = businessRef.collection('members').doc(uid);
    const businessDoc = await transaction.get(businessRef);
    const userDoc = await transaction.get(userRef);
    const existingBusinessId = userDoc.exists ? userDoc.data().primaryBusinessId : null;
    if (!businessDoc.exists || businessDoc.data().ownerUid !== link.ownerUid) {
      throw new Error('INVALID_BUSINESS');
    }
    if (existingBusinessId && existingBusinessId !== businessId) {
      throw new Error('OTHER_BUSINESS');
    }
    const existingMembership = await transaction.get(membershipRef);
    let resolvedBranchName = branchName;
    if (existingMembership.exists) {
      const current = existingMembership.data();
      if (current.active !== true ||
          current.businessId !== businessId ||
          current.role !== 'branch' ||
          current.branchId !== branchId) {
        throw new Error('OTHER_BUSINESS');
      }
      resolvedBranchName = current.branchName || branchName;
    } else {
      transaction.set(membershipRef, {
        uid,
        role: 'branch',
        businessId,
        branchId,
        branchName,
        email: req.firebaseUser.email || null,
        active: true,
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    transaction.set(userRef, { primaryBusinessId: businessId }, { merge: true });
    transaction.update(codeRef, {
      used: true,
      usedBy: uid,
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { businessId, branchId, branchName: resolvedBranchName, role: 'branch' };
  });
  return res.json({ success: true, ...result });
}));

router.post('/bootstrap', requireFirebaseUser, asyncHandler(async (req, res) => {
  const uid = req.firebaseUser.uid;
  const businessId = typeof req.body?.businessId === 'string' ? req.body.businessId.trim() : '';
  const branchId = typeof req.body?.branchId === 'string' ? req.body.branchId.trim() : '';
  const branchName = typeof req.body?.branchName === 'string' ? req.body.branchName.trim() : '';
  if (!businessId || !branchId || !validName(branchName)) {
    return res.status(400).json({ success: false, message: 'Business, branch, and branch name are required.' });
  }
  const db = firestore();
  const businessRef = db.collection('businesses').doc(businessId);
  const memberRef = businessRef.collection('members').doc(uid);
  const userRef = db.collection('users').doc(uid);
  const result = await db.runTransaction(async (transaction) => {
    const businessDoc = await transaction.get(businessRef);
    const userDoc = await transaction.get(userRef);
    if (!businessDoc.exists || businessDoc.data().ownerUid !== uid) throw new Error('INVALID_BUSINESS');
    const existingBusinessId = userDoc.exists ? userDoc.data().primaryBusinessId : null;
    if (existingBusinessId && existingBusinessId !== businessId) throw new Error('OTHER_BUSINESS');
    transaction.set(memberRef, {
      uid,
      role: 'owner',
      businessId,
      branchId,
      branchName,
      email: req.firebaseUser.email || null,
      active: true,
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(userRef, { primaryBusinessId: businessId }, { merge: true });
    return { businessId, branchId, branchName, role: 'owner' };
  });
  return res.json({ success: true, ...result });
}));

router.use((error, req, res, next) => {
  const messages = {
    INVALID_CODE: ['Invalid linking code.', 400],
    EXPIRED_CODE: ['Linking code has expired or was already used.', 410],
    INVALID_BUSINESS: ['The linking business is no longer valid.', 409],
    OTHER_BUSINESS: ['This StockSales account is already linked to another business.', 409],
  };
  const mapped = messages[error.message];
  if (mapped) return res.status(mapped[1]).json({ success: false, message: mapped[0] });
  console.error('Owner linking request failed:', error);
  return res.status(500).json({ success: false, message: 'Linking request failed.' });
});

module.exports = router;
