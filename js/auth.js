/* =============================================
   AKASYA COFFEE - AUTHENTICATION MODULE
   Handles login, registration, roles, and access control
   ============================================= */

const Auth = (function() {
    'use strict';

    // ==========================================
    // STATE
    // ==========================================
    let currentUser = null;
    let userRole = null;   // 'admin' | 'staff' | 'viewer'
    let userProfile = null;
    let _authUnsubscribe = null;

    // ==========================================
    // ROLE PERMISSIONS
    // ==========================================
    const PERMISSIONS = {
        admin: {
            pages: ['dashboard', 'inventory', 'receive', 'transfer', 'suppliers', 'branches', 'recipes', 'reports', 'settings', 'users'],
            canAddItem: true, canEditItem: true, canDeleteItem: true,
            canAddSupplier: true, canEditSupplier: true, canDeleteSupplier: true,
            canAddRecipe: true, canEditRecipe: true, canDeleteRecipe: true,
            canReceiveStock: true, canTransferStock: true, canAdjustStock: true,
            canManageUsers: true, canEditSettings: true,
            canExport: true, canImport: true, canBackup: true, canReset: true
        },
        staff: {
            pages: ['dashboard', 'inventory', 'receive', 'transfer', 'branches', 'recipes', 'reports'],
            canAddItem: false, canEditItem: false, canDeleteItem: false,
            canAddSupplier: false, canEditSupplier: false, canDeleteSupplier: false,
            canAddRecipe: false, canEditRecipe: false, canDeleteRecipe: false,
            canReceiveStock: true, canTransferStock: true, canAdjustStock: true,
            canManageUsers: false, canEditSettings: false,
            canExport: true, canImport: false, canBackup: false, canReset: false
        },
        viewer: {
            pages: ['dashboard', 'inventory', 'branches', 'recipes', 'reports'],
            canAddItem: false, canEditItem: false, canDeleteItem: false,
            canAddSupplier: false, canEditSupplier: false, canDeleteSupplier: false,
            canAddRecipe: false, canEditRecipe: false, canDeleteRecipe: false,
            canReceiveStock: false, canTransferStock: false, canAdjustStock: false,
            canManageUsers: false, canEditSettings: false,
            canExport: true, canImport: false, canBackup: false, canReset: false
        }
    };

    // ==========================================
    // INITIALIZATION
    // ==========================================
    function init() {
        if (!DB.isConfigured()) return Promise.reject("Firebase not configured");

        const auth = DB.getAuth();

        return new Promise((resolve) => {
            _authUnsubscribe = auth.onAuthStateChanged(firebaseUser => {
                if (firebaseUser) {
                    currentUser = firebaseUser;
                    loadUserProfile(firebaseUser.uid).then(() => {
                        resolve(firebaseUser);
                    });
                } else {
                    currentUser = null;
                    userRole = null;
                    userProfile = null;
                    resolve(null);
                }
            });
        });
    }

    // ==========================================
    // USER PROFILE
    // ==========================================
    function loadUserProfile(uid) {
        return DB.users.getOne(uid).then(profile => {
            if (profile) {
                userProfile = profile;
                userRole = profile.role || 'viewer';
            } else {
                // No profile found - viewer default
                userRole = 'viewer';
                userProfile = { uid, role: 'viewer' };
            }
            return profile;
        }).catch(() => {
            userRole = 'viewer';
            userProfile = { uid, role: 'viewer' };
        });
    }

    // ==========================================
    // LOGIN / LOGOUT
    // ==========================================
    function login(email, password) {
        const auth = DB.getAuth();
        
        // 1. Force Local Storage Persistence first to bypass browser privacy filters
        return firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
            .then(() => {
                // 2. Proceed with the standard sign-in once persistence is secured
                return auth.signInWithEmailAndPassword(email, password);
            })
            .then(credential => {
                currentUser = credential.user;
                return loadUserProfile(credential.user.uid).then(() => credential.user);
            })
            .catch(error => {
                console.error("Authentication Error Details:", error.code, error.message);
                throw error; // Pass the error along to your UI notifier
            });
    }

    function logout() {
        const auth = DB.getAuth();
        return auth.signOut().then(() => {
            currentUser = null;
            userRole = null;
            userProfile = null;
        });
    }

    // ==========================================
    // REGISTRATION
    // ==========================================
    function register(email, password, displayName, role) {
        const auth = DB.getAuth();
        return auth.createUserWithEmailAndPassword(email, password)
            .then(credential => {
                // Save user profile to database
                const profile = {
                    uid: credential.user.uid,
                    email: email,
                    displayName: displayName || email.split('@')[0],
                    role: role || 'viewer',
                    createdAt: new Date().toISOString(),
                    isActive: true
                };
                return DB.users.save(credential.user.uid, profile).then(() => {
                    currentUser = credential.user;
                    userRole = profile.role;
                    userProfile = profile;
                    return credential.user;
                });
            });
    }

    // ==========================================
    // FIRST-TIME ADMIN SETUP
    // ==========================================

    /**
     * Check if any admin user exists in the database.
     * Used to determine if first-time setup is needed.
     *
     * IMPORTANT: this is called while the visitor is logged OUT (that's the
     * whole point - to decide whether to show "create admin" or "login").
     * The recommended security rules only allow reading /users when
     * auth != null, so a raw read of /users here would always fail for a
     * logged-out visitor and (if mishandled) make the app think no admin
     * exists forever, even after one has been created. To avoid that we
     * check a small, publicly-readable flag at /meta/adminExists instead.
     * The /users scan below only remains as a legacy fallback for databases
     * that had users created before this flag existed.
     */
    function checkAdminExists() {
        return DB.meta.getAdminExists().then(flagged => {
            if (flagged) return true;
            return DB.read('users').then(users => {
                if (!users) return false;
                const userList = Object.values(users);
                return userList.some(u => u.role === 'admin');
            }).catch(() => false);
        }).catch(() => false);
    }

    /**
     * Marks /meta/adminExists = true so future logged-out visits correctly
     * go to the login screen instead of "create first admin". Failures are
     * swallowed - worst case the legacy /users fallback above covers it for
     * an already-logged-in admin, and this simply gets retried next time.
     */
    function _flagAdminExists() {
        return DB.meta.setAdminExists().catch(() => {});
    }

    /**
     * Create the first admin account.
     * This should only be called when no admin exists yet.
     */
    function createFirstAdmin(email, password, displayName) {
        return register(email, password, displayName, 'admin').then(user => {
            return _flagAdminExists().then(() => user);
        });
    }

    // ==========================================
    // USER MANAGEMENT (Admin only)
    // ==========================================
    function getAllUsers() {
        return new Promise((resolve, reject) => {
            DB.users.getAll(users => resolve(users));
        });
    }

    /**
     * Create a new user account as an admin, without signing the admin out.
     *
     * The Firebase client SDK doesn't have a way to create a user "on behalf
     * of" someone else - createUserWithEmailAndPassword always signs in as
     * the newly created user on whatever app instance you call it on. The
     * standard workaround is to spin up a second, temporary Firebase App
     * instance (same project config, different app name) just to create the
     * account, then immediately sign that instance out and delete it. The
     * admin's session on the primary app instance is never touched.
     *
     * The user's profile is written using the PRIMARY database connection,
     * so the write is authenticated as the admin (required by the security
     * rules), not as the brand-new user.
     */
    function createUser(email, password, displayName, role) {
        if (!isAdmin()) {
            return Promise.reject(new Error('Only admins can create users.'));
        }
        if (!email || !password) {
            return Promise.reject(new Error('Email and password are required.'));
        }
        if (password.length < 6) {
            return Promise.reject(new Error('Password must be at least 6 characters.'));
        }

        const config = DB.getFirebaseConfig();
        const secondaryName = 'Secondary-' + Date.now();
        const secondaryApp = firebase.initializeApp(config, secondaryName);
        const secondaryAuth = secondaryApp.auth();

        const cleanup = () => {
            return secondaryAuth.signOut().catch(() => {}).then(() => secondaryApp.delete().catch(() => {}));
        };

        return secondaryAuth.createUserWithEmailAndPassword(email, password)
            .then(credential => {
                const profile = {
                    uid: credential.user.uid,
                    email: email,
                    displayName: displayName || email.split('@')[0],
                    role: role || 'viewer',
                    createdAt: new Date().toISOString(),
                    createdBy: currentUser ? currentUser.uid : '',
                    isActive: true
                };
                return DB.users.save(credential.user.uid, profile).then(() => profile);
            })
            .then(profile => {
                return cleanup().then(() => {
                    if (profile.role === 'admin') _flagAdminExists();
                    return profile;
                });
            })
            .catch(err => {
                return cleanup().then(() => { throw err; });
            });
    }

    function updateUserRole(uid, newRole) {
        return DB.users.update(uid, { role: newRole, updatedAt: new Date().toISOString() }).then(result => {
            if (newRole === 'admin') _flagAdminExists();
            return result;
        });
    }

    function deactivateUser(uid) {
        return DB.users.update(uid, { isActive: false, updatedAt: new Date().toISOString() });
    }

    function activateUser(uid) {
        return DB.users.update(uid, { isActive: true, updatedAt: new Date().toISOString() });
    }

    // ==========================================
    // PASSWORD MANAGEMENT
    // ==========================================
    function resetPassword(email) {
        const auth = DB.getAuth();
        return auth.sendPasswordResetEmail(email);
    }

    function changePassword(newPassword) {
        if (!currentUser) return Promise.reject("Not logged in");
        return currentUser.updatePassword(newPassword);
    }

    // ==========================================
    // ACCESS CONTROL HELPERS
    // ==========================================
    function getUser() { return currentUser; }
    function getRole() { return userRole; }
    function getProfile() { return userProfile; }
    function isLoggedIn() { return !!currentUser; }
    function isAdmin() { return userRole === 'admin'; }
    function isStaff() { return userRole === 'staff'; }
    function isViewer() { return userRole === 'viewer'; }

    function can(permission) {
        if (!userRole || !PERMISSIONS[userRole]) return false;
        return !!PERMISSIONS[userRole][permission];
    }

    function canAccessPage(page) {
        if (!userRole || !PERMISSIONS[userRole]) return false;
        return PERMISSIONS[userRole].pages.includes(page);
    }

    function getAllowedPages() {
        if (!userRole || !PERMISSIONS[userRole]) return [];
        return PERMISSIONS[userRole].pages;
    }

    // ==========================================
    // UI HELPERS
    // ==========================================
    function getDisplayName() {
        if (userProfile && userProfile.displayName) return userProfile.displayName;
        if (currentUser && currentUser.displayName) return currentUser.displayName;
        if (currentUser && currentUser.email) return currentUser.email.split('@')[0];
        return 'User';
    }

    function getEmail() {
        return currentUser ? currentUser.email : '';
    }

    function getAvatarText() {
        const name = getDisplayName();
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }

    function getRoleLabel() {
        if (!userRole) return 'Guest';
        return userRole.charAt(0).toUpperCase() + userRole.slice(1);
    }

    // ==========================================
    // CLEANUP
    // ==========================================
    function cleanup() {
        if (_authUnsubscribe) {
            _authUnsubscribe();
            _authUnsubscribe = null;
        }
    }

    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        init,
        login,
        logout,
        register,
        resetPassword,
        changePassword,
        checkAdminExists,
        createFirstAdmin,
        getAllUsers,
        createUser,
        updateUserRole,
        deactivateUser,
        activateUser,
        getUser,
        getRole,
        getProfile,
        isLoggedIn,
        isAdmin,
        isStaff,
        isViewer,
        can,
        canAccessPage,
        getAllowedPages,
        getDisplayName,
        getEmail,
        getAvatarText,
        getRoleLabel,
        cleanup,
        PERMISSIONS
    };
})();
