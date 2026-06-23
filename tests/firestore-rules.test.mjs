import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test, before, after, beforeEach } from 'node:test';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(join(here, '..', 'firestore.rules'), 'utf8');

const LOG_PATH = 'mission_logs/alice_run1';
const ALICE_DOC = { userId: 'alice', lesson: 'straight', score: 100 };

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-driving',
    firestore: { rules },
  });
});

after(async () => {
  await testEnv.cleanup();
});

// Fresh state per test: clear, then seed alice's owned doc with rules bypassed.
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), LOG_PATH), ALICE_DOC);
  });
});

const aliceDb = () => testEnv.authenticatedContext('alice').firestore();
const bobDb = () => testEnv.authenticatedContext('bob').firestore();
const unauthDb = () => testEnv.unauthenticatedContext().firestore();

// --- reads ---
test('owner can get own doc', async () => {
  await assertSucceeds(getDoc(doc(aliceDb(), LOG_PATH)));
});

test('owner can list own docs', async () => {
  const q = query(collection(aliceDb(), 'mission_logs'), where('userId', '==', 'alice'));
  await assertSucceeds(getDocs(q));
});

test('other user cannot get owner doc', async () => {
  await assertFails(getDoc(doc(bobDb(), LOG_PATH)));
});

test('other user cannot list owner docs', async () => {
  const q = query(collection(bobDb(), 'mission_logs'), where('userId', '==', 'alice'));
  await assertFails(getDocs(q));
});

test('unauthenticated cannot get doc', async () => {
  await assertFails(getDoc(doc(unauthDb(), LOG_PATH)));
});

test('unauthenticated cannot list docs', async () => {
  const q = query(collection(unauthDb(), 'mission_logs'), where('userId', '==', 'alice'));
  await assertFails(getDocs(q));
});

// --- creates ---
test('user can create own doc', async () => {
  await assertSucceeds(
    setDoc(doc(bobDb(), 'mission_logs/bob_run1'), { userId: 'bob', lesson: 'turn', score: 50 }),
  );
});

test('user cannot create doc spoofing another userId', async () => {
  await assertFails(
    setDoc(doc(bobDb(), 'mission_logs/bob_run2'), { userId: 'alice', lesson: 'turn', score: 50 }),
  );
});

test('unauthenticated cannot create doc', async () => {
  await assertFails(
    setDoc(doc(unauthDb(), 'mission_logs/anon_run1'), { userId: 'alice', lesson: 'turn', score: 50 }),
  );
});

// --- update (denied for all by design) ---
test('owner cannot update own doc (update denied)', async () => {
  await assertFails(updateDoc(doc(aliceDb(), LOG_PATH), { score: 999 }));
});

// --- deletes ---
test('owner can delete own doc', async () => {
  await assertSucceeds(deleteDoc(doc(aliceDb(), LOG_PATH)));
});

test('other user cannot delete owner doc', async () => {
  await assertFails(deleteDoc(doc(bobDb(), LOG_PATH)));
});
