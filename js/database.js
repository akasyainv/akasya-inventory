/* =============================================
   AKASYA COFFEE - DATABASE MODULE
   Firebase Realtime Database Integration
   =============================================

   SETUP INSTRUCTIONS:
   1. Go to https://console.firebase.google.com/
   2. Create a new project (or use existing)
   3. Enable Authentication (Email/Password)
   4. Create a Realtime Database
   5. Copy your Firebase config object
   6. Replace the placeholder values below
   ============================================= */

const DB = (function() {
    'use strict';

    // ==========================================
    // FIREBASE CONFIGURATION
    // Replace these values with your own Firebase project config.
   // Found in: Firebase Console > Project Settings > General > Your apps
    // ==========================================
    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyCIxN3KpGcHUwS_k0BfrKXjIX5vYQEuul0",
        databaseURL: "https://akasya-coffee-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "akasya-coffee",
        storageBucket: "akasya-coffee.firebasestorage.app",
        messagingSenderId: "542797634137",
        appId: "1:542797634137:web:cc29db9d8d91143055af48"
    };

    // ==========================================
    // INITIALIZATION
    // ==========================================
    let app = null;
    let database = null;
    let auth = null;
    let _listeners = [];

    function init() {
        // Check if config has been updated
        if (FIREBASE_CONFIG.apiKey === "YOUR_API_KEY") {
            console.warn("[Akasya] Firebase config not set. Please update FIREBASE_CONFIG in js/database.js");
            return false;
        }
        try {
            // Initialize Firebase only once
            if (!firebase.apps.length) {
                app = firebase.initializeApp(FIREBASE_CONFIG);
            } else {
                app = firebase.apps[0];
            }
            database = firebase.database();
            auth = firebase.auth();
            console.log("[Akasya] Firebase initialized successfully");
            return true;
        } catch (err) {
            console.error("[Akasya] Firebase initialization failed:", err);
            return false;
        }
    }

    function getDatabase() { return database; }
    function getAuth() { return auth; }
    function isConfigured() { return FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY"; }

    /**
     * Returns a copy of the Firebase config so other modules (e.g. Auth, for
     * spinning up a secondary app instance to create users without signing
     * the admin out) can initialize their own Firebase app if needed.
     */
    function getFirebaseConfig() {
        return { ...FIREBASE_CONFIG };
    }

    // ==========================================
    // GENERIC CRUD OPERATIONS
    // ==========================================

    /**
     * Write data to a path. Returns a Promise.
     */
    function write(path, data) {
        if (!database) return Promise.reject("Database not initialized");
        return database.ref(path).set(data)
            .then(() => ({ success: true }))
            .catch(err => { console.error(`[DB] Write error at ${path}:`, err); throw err; });
    }

    /**
     * Read data from a path once. Returns a Promise with the value.
     */
    function read(path) {
        if (!database) return Promise.reject("Database not initialized");
        return database.ref(path).once('value')
            .then(snapshot => snapshot.val())
            .catch(err => { console.error(`[DB] Read error at ${path}:`, err); throw err; });
    }

    /**
     * Push new data (auto-generates key). Returns a Promise with the new key.
     */
    function push(path, data) {
        if (!database) return Promise.reject("Database not initialized");
        const ref = database.ref(path).push();
        return ref.set({ ...data, id: ref.key, createdAt: data.createdAt || new Date().toISOString() })
            .then(() => ({ success: true, key: ref.key }))
            .catch(err => { console.error(`[DB] Push error at ${path}:`, err); throw err; });
    }

    /**
     * Update specific fields. Returns a Promise.
     */
    function update(path, data) {
        if (!database) return Promise.reject("Database not initialized");
        return database.ref(path).update(data)
            .then(() => ({ success: true }))
            .catch(err => { console.error(`[DB] Update error at ${path}:`, err); throw err; });
    }

    /**
     * Remove data at path. Returns a Promise.
     */
    function remove(path) {
        if (!database) return Promise.reject("Database not initialized");
        return database.ref(path).remove()
            .then(() => ({ success: true }))
            .catch(err => { console.error(`[DB] Remove error at ${path}:`, err); throw err; });
    }

    /**
     * Atomically read-modify-write a single value using Firebase's
     * transaction API. Use this instead of read()+update() for any numeric
     * field (like stock quantities) that can be changed concurrently by
     * more than one user/tab - a plain read-then-write is a race condition
     * because two simultaneous writers can both read the same "before"
     * value and one of their updates will silently overwrite the other.
     *
     * updateFn receives the current value (or null) and must return the
     * new value, or `undefined` to abort the write (e.g. insufficient stock).
     */
    function runTransaction(path, updateFn) {
        if (!database) return Promise.reject("Database not initialized");
        return database.ref(path).transaction(updateFn).then(result => {
            if (!result.committed) {
                const err = new Error('Update was cancelled - the value changed before the update completed, or the change was invalid (e.g. would result in negative stock).');
                err.aborted = true;
                throw err;
            }
            return { success: true, value: result.snapshot.val() };
        }).catch(err => {
            console.error(`[DB] Transaction error at ${path}:`, err);
            throw err;
        });
    }

    // ==========================================
    // REAL-TIME LISTENERS
    // ==========================================

    /**
     * Listen to a path for real-time changes.
     * Returns an unsubscribe function.
     */
    function listen(path, callback) {
        if (!database) return function(){};
        const ref = database.ref(path);
        const handler = snapshot => {
            const val = snapshot.val();
            // Convert object-of-objects to array if needed
            if (val && typeof val === 'object' && !Array.isArray(val)) {
                const arr = Object.entries(val).map(([key, v]) => {
                    if (typeof v === 'object' && v !== null) {
                        return { ...v, _key: key };
                    }
                    return v;
                });
                callback(arr);
            } else {
                callback(val || []);
            }
        };
        ref.on('value', handler);
        const unsubscribe = () => ref.off('value', handler);
        _listeners.push({ path, unsubscribe });
        return unsubscribe;
    }

    /**
     * Listen to a single object (not array). Returns unsubscribe function.
     */
    function listenOne(path, callback) {
        if (!database) return function(){};
        const ref = database.ref(path);
        const handler = snapshot => {
            callback(snapshot.val() || {});
        };
        ref.on('value', handler);
        const unsubscribe = () => ref.off('value', handler);
        _listeners.push({ path, unsubscribe });
        return unsubscribe;
    }

    /**
     * Remove all active listeners.
     */
    function detachAllListeners() {
        _listeners.forEach(l => l.unsubscribe());
        _listeners = [];
    }

    // ==========================================
    // COLLECTION HELPERS
    // ==========================================

    // --- INVENTORY ---
    const inventory = {
        getAll(callback) { return listen('inventory', callback); },
        getOne(id) { return read(`inventory/${id}`); },
        create(data) { return push('inventory', data); },
        update(id, data) { return update_db(`inventory/${id}`, data); },
        delete(id) { return remove(`inventory/${id}`); },
        /**
         * Atomically add (or subtract, with a negative delta) `delta` from a
         * quantity field (qtyWarehouse/qtyBamban/qtyCapas). Safe to call
         * concurrently from multiple sessions/tabs for the same item+field.
         * By default aborts (rejects with err.aborted = true) rather than
         * letting the quantity go negative.
         */
        adjustQty(id, field, delta, options) {
            const allowNegative = !!(options && options.allowNegative);
            return runTransaction(`inventory/${id}/${field}`, current => {
                const next = (current || 0) + delta;
                if (!allowNegative && next < 0) return undefined; // abort transaction
                return next;
            });
        }
    };

    // --- SUPPLIERS ---
    const suppliers = {
        getAll(callback) { return listen('suppliers', callback); },
        getOne(id) { return read(`suppliers/${id}`); },
        create(data) { return push('suppliers', data); },
        update(id, data) { return update_db(`suppliers/${id}`, data); },
        delete(id) { return remove(`suppliers/${id}`); }
    };

    // --- TRANSACTIONS ---
    const transactions = {
        getAll(callback) { return listen('transactions', callback); },
        create(data) { return push('transactions', data); },
        delete(id) { return remove(`transactions/${id}`); }
    };

    // --- RECIPES ---
    const recipes = {
        getAll(callback) { return listen('recipes', callback); },
        create(data) { return push('recipes', data); },
        update(id, data) { return update_db(`recipes/${id}`, data); },
        delete(id) { return remove(`recipes/${id}`); }
    };

    // --- SETTINGS ---
    const settings = {
        get(callback) { return listenOne('settings', callback); },
        save(data) { return write('settings', data); }
    };

    // --- USERS ---
    const users = {
        getAll(callback) { return listen('users', callback); },
        getOne(uid) { return read(`users/${uid}`); },
        save(uid, data) { return write(`users/${uid}`, data); },
        update(uid, data) { return update_db(`users/${uid}`, data); },
        delete(uid) { return remove(`users/${uid}`); }
    };

    // --- META (small, publicly-readable flags) ---
    // "adminExists" lets a logged-out visitor's browser tell setup screen
    // from login screen apart WITHOUT needing to read the protected /users
    // node (which requires auth != null under the recommended rules below).
    const meta = {
        getAdminExists() {
            return read('meta/adminExists').then(val => !!val);
        },
        setAdminExists() {
            return write('meta/adminExists', true);
        }
    };

    // Need a separate internal reference since 'update' conflicts with the method name above
    function update_db(path, data) {
        if (!database) return Promise.reject("Database not initialized");
        return database.ref(path).update(data)
            .then(() => ({ success: true }))
            .catch(err => { console.error(`[DB] Update error at ${path}:`, err); throw err; });
    }

    // ==========================================
    // SECURITY RULES HELPER
    // ==========================================

    /**
     * These are the recommended Firebase Realtime Database security rules.
     * Copy these into: Firebase Console > Realtime Database > Rules
     *
     * {
     *   "rules": {
     *     "inventory": {
     *       ".read": "auth != null",
     *       ".write": "auth != null"
     *     },
     *     "suppliers": {
     *       ".read": "auth != null",
     *       ".write": "auth != null"
     *     },
     *     "transactions": {
     *       ".read": "auth != null",
     *       ".write": "auth != null"
     *     },
     *     "recipes": {
     *       ".read": "auth != null",
     *       ".write": "auth != null"
     *     },
     *     "settings": {
     *       ".read": "auth != null",
     *       ".write": "auth != null && root.child('users/' + auth.uid + '/role').val() === 'admin'"
     *     },
     *     "users": {
     *       ".read": "auth != null && root.child('users/' + auth.uid + '/role').val() === 'admin'",
     *       ".write": "auth != null && root.child('users/' + auth.uid + '/role').val() === 'admin'",
     *       "$uid": {
     *         ".read": "auth != null && (auth.uid === $uid || root.child('users/' + auth.uid + '/role').val() === 'admin')",
     *         ".write": "auth != null && (auth.uid === $uid || root.child('users/' + auth.uid + '/role').val() === 'admin')"
     *       }
     *     },
     *     "meta": {
     *       "adminExists": {
     *         ".read": true,
     *         ".write": "!data.exists() || (auth != null && root.child('users/' + auth.uid + '/role').val() === 'admin')"
     *       }
     *     }
     *   }
     * }
     *
     * NOTE: "meta/adminExists" must be publicly readable (even when logged
     * out) so the app can tell a fresh install (show "create admin" screen)
     * apart from an existing install (show "login" screen) without needing
     * to read the protected /users node first. It can only ever be set to
     * true, and only by an admin (or by anyone the very first time, when it
     * doesn't exist yet - that's how the first admin account gets flagged).
     */

    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        init,
        isConfigured,
        getDatabase,
        getAuth,
        getFirebaseConfig,
        write,
        read,
        push,
        update: update_db,
        remove,
        runTransaction,
        listen,
        listenOne,
        detachAllListeners,
        inventory,
        suppliers,
        transactions,
        recipes,
        settings,
        users,
        meta
    };
})();
