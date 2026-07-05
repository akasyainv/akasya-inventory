/* =============================================
   AKASYA COFFEE - DATABASE MODULE
   Firebase Realtime Database Integration
   ============================================= */

const DB = (function() {
    'use strict';

    // ==========================================
    // FIREBASE CONFIGURATION
    // ==========================================
    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyCIxN3KpGcHUwS_k0BfrKXjIX5vYQEuul0",
        authDomain: "akasya-coffee.firebaseapp.com",
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
    let rtdb = null; 
    let auth = null;
    let _listeners = [];

    function init() {
        if (FIREBASE_CONFIG.apiKey === "YOUR_API_KEY") {
            console.warn("[Akasya] Firebase config not set. Please update FIREBASE_CONFIG in js/database.js");
            return false;
        }
        try {
            if (!firebase.apps.length) {
                app = firebase.initializeApp(FIREBASE_CONFIG);
            } else {
                app = firebase.apps[0];
            }
            rtdb = firebase.database();
            auth = firebase.auth();
            console.log("[Akasya] Firebase initialized successfully");
            return true;
        } catch (err) {
            console.error("[Akasya] Firebase initialization failed:", err);
            return false;
        }
    }

    function getDatabase() { return rtdb; }
    function getAuth() { return auth; }
    function isConfigured() { return FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY"; }

    // ==========================================
    // GENERIC CRUD OPERATIONS
    // ==========================================

    function write(path, data) {
        if (!rtdb) return Promise.reject("Database not initialized");
        return rtdb.ref(path).set(data)
            .then(() => ({ success: true }))
            .catch(err => { console.error(`[DB] Write error at ${path}:`, err); throw err; });
    }

    function read(path) {
        if (!rtdb) return Promise.reject("Database not initialized");
        return rtdb.ref(path).once('value')
            .then(snapshot => snapshot.val())
            .catch(err => { console.error(`[DB] Read error at ${path}:`, err); throw err; });
    }

    function push(path, data) {
        if (!rtdb) return Promise.reject("Database not initialized");
        const ref = rtdb.ref(path).push();
        return ref.set({ ...data, id: ref.key, createdAt: data.createdAt || new Date().toISOString() })
            .then(() => ({ success: true, key: ref.key }))
            .catch(err => { console.error(`[DB] Push error at ${path}:`, err); throw err; });
    }

    function update(path, data) {
        if (!rtdb) return Promise.reject("Database not initialized");
        return rtdb.ref(path).update(data)
            .then(() => ({ success: true }))
            .catch(err => { console.error(`[DB] Update error at ${path}:`, err); throw err; });
    }

    function remove(path) {
        if (!rtdb) return Promise.reject("Database not initialized");
        return rtdb.ref(path).remove()
            .then(() => ({ success: true }))
            .catch(err => { console.error(`[DB] Remove error at ${path}:`, err); throw err; });
    }

    // ==========================================
    // REAL-TIME LISTENERS
    // ==========================================

    function listen(path, callback) {
        if (!rtdb) return function(){};
        const ref = rtdb.ref(path);
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
        if (!rtdb) return function(){};
        const ref = rtdb.ref(path);
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
        delete(id) { return remove(`inventory/${id}`); }
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

    function update_db(path, data) {
        if (!rtdb) return Promise.reject("Database not initialized");
        return rtdb.ref(path).update(data)
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
        write,
        read,
        push,
        update: update_db,
        remove,
        listen,
        listenOne,
        detachAllListeners,
        inventory,
        suppliers,
        transactions,
        recipes,
        settings,
        users
    };
})();
