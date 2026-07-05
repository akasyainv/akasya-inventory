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
        return auth.signInWithEmailAndPassword(email, password)
            .then(credential => {
                currentUser = credential.user;
                return loadUserProfile(credential.user.uid).then(() => credential.user);
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
     */
    function checkAdminExists() {
        return DB.read('users').then(users => {
            if (!users) return false;
            const userList = Object.values(users);
            return userList.some(u => u.role === 'admin');
        }).catch(() => false);
    }

    /**
     * Create the first admin account.
     * This should only be called when no admin exists yet.
     */
    function createFirstAdmin(email, password, displayName) {
        return register(email, password, displayName, 'admin');
    }

    // ==========================================
    // USER MANAGEMENT (Admin only)
    // ==========================================
    function getAllUsers() {
        return new Promise((resolve, reject) => {
            DB.users.getAll(users => resolve(users));
        });
    }

    function createUser(email, password, displayName, role) {
        // For admin creating other users, we need to use Firebase Admin SDK
        // Since we can't use Admin SDK from client-side, we'll use a workaround:
        // Store pending user creation and have the new user sign up themselves,
        // OR require the admin to set a temporary password
        // The simplest approach for a client-side app: admin sends an invite link
        // For this implementation, we'll provide a method that creates a user
        // Note: In production, you'd use Cloud Functions for this
        return { message: "Please have the user register themselves, then change their role in User Management." };
    }

    function updateUserRole(uid, newRole) {
        return DB.users.update(uid, { role: newRole, updatedAt: new Date().toISOString() });
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
