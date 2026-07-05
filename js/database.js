/* =============================================
   AKASYA COFFEE - DATABASE MODULE
   Firebase Realtime Database Integration
   ============================================= */

const DB = (function() {
    'use strict';

    // ==========================================
    // FIREBASE CONFIGURATION
    // Replace these values with your own Firebase project config.
    // Found in: Firebase Console > Project Settings > General > Your apps
    // ==========================================
    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyDT1Up_WAGwLYHNbwE8JmAAd3P_Q1evHHM",
        authDomain: "akasya-coffee-inventory.firebaseapp.com",
        databaseURL: "https://akasya-coffee-inventory-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "akasya-coffee-inventory",
        storageBucket: "akasya-coffee-inventory.firebasestorage.app",
        messagingSenderId: "109682930070",
        appId: "1:109682930070:web:49a0caaa983a1ab66aedb7"
    };

    // ==========================================
    // INITIALIZATION
    // ==========================================
    let app = null;
    let database = null;
    let auth = null;
    let _listeners = [];

    function init() {
        if (FIREBASE_CONFIG.apiKey === "YOUR_API_KEY" || !FIREBASE_CONFIG.apiKey) {
            console.warn("[Akasya] Firebase config not set. Please update FIREBASE_CONFIG in js/database.js");
            return false;
        }
        try {
            if (!firebase.apps.length) {
                app = firebase.initializeApp(FIREBASE_CONFIG);
            } else {
                app = firebase.apps[0];
            }
            database = firebase.database();
            auth = firebase.auth();

            // CRITICAL: Set auth persistence to LOCAL so users stay logged in
            // across browser restarts and different devices
            auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
                .then(() => console.log("[Akasya] Auth persistence set to LOCAL"))
                .catch(err => console.error("[Akasya] Auth persistence error:", err));

            console.log("[Akasya] Firebase initialized successfully");
            return true;
        } catch (err) {
            console.error("[Akasya] Firebase initialization failed:", err);
            return false;
        }
    }

    function getDatabase() { return database; }
    function getAuth() { return auth; }
    function isConfigured() { return FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" && !!FIREBASE_CONFIG.apiKey; }

    function getFirebaseConfig() {
        return { ...FIREBASE_CONFIG };
    }

    // ==========================================
    // GENERIC CRUD OPERATIONS
    // ==========================================

    function write(path, data) {
        if (!database) return Promise.reject("Database not initialized");
        return database.ref(path).set(data)
            .then(() => ({ success: true }))
            .catch(err => { console.error(`[DB] Write error at ${path}:`, err); throw err; });
    }

    function read(path) {
        if (!database) return Promise.reject("Database not initialized");
        return database.ref(path).once('value')
            .then(snapshot => snapshot.val())
            .catch(err => { console.error(`[DB] Read error at ${path}:`, err); throw err; });
    }

    function push(path, data) {
        if (!database) return Promise.reject("Database not initialized");
        const ref = database.ref(path).push();
        return ref.set({ ...data, id: ref.key, createdAt: data.createdAt || new Date().toISOString() })
            .then(() => ({ success: true, key: ref.key }))
            .catch(err => { console.error(`[DB] Push error at ${path}:`, err); throw err; });
    }

    function update(path, data) {
        if (!database) return Promise.reject("Database not initialized");
        return database.ref(path).update(data)
            .then(() => ({ success: true }))
            .catch(err => { console.error(`[DB] Update error at ${path}:`, err); throw err; });
    }

    function remove(path) {
        if (!database) return Promise.reject("Database not initialized");
        return database.ref(path).remove()
            .then(() => ({ success: true }))
            .catch(err => { console.error(`[DB] Remove error at ${path}:`, err); throw err; });
    }

    function runTransaction(path, updateFn) {
        if (!database) return Promise.reject("Database not initialized");
        return database.ref(path).transaction(updateFn).then(result => {
            if (!result.committed) {
                const err = new Error('Update was cancelled - insufficient stock or concurrent modification.');
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

    function listen(path, callback) {
        if (!database) return function(){};
        const ref = database.ref(path);
        const handler = snapshot => {
            const val = snapshot.val();
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

    function detachAllListeners() {
        _listeners.forEach(l => l.unsubscribe());
        _listeners = [];
    }

    // ==========================================
    // COLLECTION HELPERS
    // ==========================================

    const inventory = {
        getAll(callback) { return listen('inventory', callback); },
        getOne(id) { return read(`inventory/${id}`); },
        create(data) { return push('inventory', data); },
        update(id, data) { return update_db(`inventory/${id}`, data); },
        delete(id) { return remove(`inventory/${id}`); },
        adjustQty(id, field, delta, options) {
            const allowNegative = !!(options && options.allowNegative);
            return runTransaction(`inventory/${id}/${field}`, current => {
                const next = (current || 0) + delta;
                if (!allowNegative && next < 0) return undefined;
                return next;
            });
        }
    };

    const suppliers = {
        getAll(callback) { return listen('suppliers', callback); },
        getOne(id) { return read(`suppliers/${id}`); },
        create(data) { return push('suppliers', data); },
        update(id, data) { return update_db(`suppliers/${id}`, data); },
        delete(id) { return remove(`suppliers/${id}`); }
    };

    const transactions = {
        getAll(callback) { return listen('transactions', callback); },
        create(data) { return push('transactions', data); },
        delete(id) { return remove(`transactions/${id}`); }
    };

    const recipes = {
        getAll(callback) { return listen('recipes', callback); },
        create(data) { return push('recipes', data); },
        update(id, data) { return update_db(`recipes/${id}`, data); },
        delete(id) { return remove(`recipes/${id}`); }
    };

    const settings = {
        get(callback) { return listenOne('settings', callback); },
        save(data) { return write('settings', data); }
    };

    const users = {
        getAll(callback) { return listen('users', callback); },
        getOne(uid) { return read(`users/${uid}`); },
        save(uid, data) { return write(`users/${uid}`, data); },
        update(uid, data) { return update_db(`users/${uid}`, data); },
        delete(uid) { return remove(`users/${uid}`); }
    };

    const meta = {
        getAdminExists() {
            return read('meta/adminExists').then(val => !!val);
        },
        setAdminExists() {
            return write('meta/adminExists', true);
        }
    };

    function update_db(path, data) {
        if (!database) return Promise.reject("Database not initialized");
        return database.ref(path).update(data)
            .then(() => ({ success: true }))
            .catch(err => { console.error(`[DB] Update error at ${path}:`, err); throw err; });
    }

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
