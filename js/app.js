/* =============================================
   AKASYA COFFEE - MAIN APPLICATION MODULE
   Navigation, UI utilities, and app orchestration
   ============================================= */

const app = (function() {
    'use strict';

    // ==========================================
    // STATE
    // ==========================================
    let currentPage = 'dashboard';
    let inventorySort = { field: 'name', dir: 'asc' };
    let inventoryFilter = { search: '', category: '', supplier: '', status: '' };
    let inventoryPageNum = 1;
    const inventoryPerPage = 15;
    let confirmCallback = null;
    let _dataReady = false;

    // Cache for real-time data
    let _inventoryData = [];
    let _suppliersData = [];
    let _transactionsData = [];
    let _recipesData = [];
    let _settingsData = {};

    // Unsubscribe functions for real-time listeners
    let _unsubInventory = null;
    let _unsubSuppliers = null;
    let _unsubTransactions = null;
    let _unsubRecipes = null;
    let _unsubSettings = null;

    // ==========================================
    // INITIALIZATION
    // ==========================================
    function init() {
        // Step 1: Initialize Firebase
        const dbReady = DB.init();

        if (!dbReady) {
            showFirebaseConfigScreen();
            return;
        }

        // Attached immediately on startup to prevent native HTML page reloads
        setupEventListeners();

        // Step 2: Set up auth state listener
        Auth.init().then(firebaseUser => {
            if (firebaseUser) {
                // User is logged in - check if active
                if (Auth.getProfile() && Auth.getProfile().isActive === false) {
                    showLoginScreen();
                    showToast('Your account has been deactivated. Contact an admin.', 'error');
                    return;
                }
                setupApp();
            } else {
                // Not logged in - check if first-time setup needed
                checkFirstTimeSetup();
            }
        }).catch(err => {
            console.error("[Akasya] Auth init error:", err);
            showLoginScreen();
        });
    }

    /**
     * Called after successful authentication. Sets up the full app.
     */
    function setupApp() {
        showAppScreen();
        setupRealTimeListeners();
        updateUserDisplay();
        applyRoleBasedUI();
        navigate('dashboard');
    }

    // ==========================================
    // REAL-TIME DATA LISTENERS
    // ==========================================
    function setupRealTimeListeners() {
        // Listen to inventory changes
        _unsubInventory = DB.inventory.getAll(data => {
            _inventoryData = data || [];
            if (currentPage === 'inventory') InventoryModule.render();
            if (currentPage === 'dashboard') renderDashboard();
            if (currentPage === 'branches') renderBranches();
            if (currentPage === 'receive') InventoryModule.populateDropdowns();
            if (currentPage === 'transfer') InventoryModule.populateTransferDropdowns();
            if (currentPage === 'recipes') RecipesModule.populateDropdowns();
        });

        // Listen to suppliers changes
        _unsubSuppliers = DB.suppliers.getAll(data => {
            _suppliersData = data || [];
            if (currentPage === 'suppliers') SuppliersModule.render();
            if (currentPage === 'inventory') InventoryModule.render();
            if (currentPage === 'dashboard') renderDashboard();
        });

        // Listen to transactions changes
        _unsubTransactions = DB.transactions.getAll(data => {
            _transactionsData = data || [];
            if (currentPage === 'dashboard') renderDashboard();
            if (currentPage === 'receive') renderRecentDeliveries();
            if (currentPage === 'transfer') renderTransferHistory();
            if (currentPage === 'reports') ReportsModule.render();
        });

        // Listen to recipes changes
        _unsubRecipes = DB.recipes.getAll(data => {
            _recipesData = data || [];
            if (currentPage === 'recipes') RecipesModule.render();
        });

        // Listen to settings changes
        _unsubSettings = DB.settings.get(data => {
            _settingsData = data || {};
            applyTheme(_settingsData.theme || 'light');
            if (currentPage === 'settings') SettingsModule.render();
        });
    }

    // ==========================================
    // AUTHENTICATION UI SCREENS
    // ==========================================
    function showLoginScreen() {
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('setupContainer').style.display = 'none';
        document.getElementById('configContainer').style.display = 'none';
        document.getElementById('loginContainer').style.display = 'flex';
        document.body.style.overflow = '';
    }

    function showSetupScreen() {
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('configContainer').style.display = 'none';
        document.getElementById('setupContainer').style.display = 'flex';
        document.body.style.overflow = '';
    }

    function showAppScreen() {
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('setupContainer').style.display = 'none';
        document.getElementById('configContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = '';
        document.body.style.overflow = '';
    }

    function showFirebaseConfigScreen() {
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('setupContainer').style.display = 'none';
        document.getElementById('configContainer').style.display = 'flex';
        document.body.style.overflow = '';
    }

    // ==========================================
    // LOGIN HANDLERS
    // ==========================================
    function handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const btn = document.getElementById('loginBtn');
        const errorEl = document.getElementById('loginError');

        if (!email || !password) {
            errorEl.textContent = 'Please enter both email and password.';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Signing in...';
        errorEl.textContent = '';

        Auth.login(email, password)
            .then(() => {
                setupApp();
                document.getElementById('loginForm').reset();
            })
            .catch(err => {
                let msg = 'Login failed. Please try again.';
                if (err.code === 'auth/user-not-found') msg = 'No account found with this email.';
                if (err.code === 'auth/wrong-password') msg = 'Incorrect password.';
                if (err.code === 'auth/invalid-email') msg = 'Invalid email address.';
                if (err.code === 'auth/too-many-requests') msg = 'Too many failed attempts. Please try again later.';
                errorEl.textContent = msg;
            })
            .finally(() => {
                btn.disabled = false;
                btn.textContent = 'Sign In';
            });
    }

    function handleSetup(e) {
        e.preventDefault();
        const displayName = document.getElementById('setupName').value.trim();
        const email = document.getElementById('setupEmail').value.trim();
        const password = document.getElementById('setupPassword').value;
        const confirmPassword = document.getElementById('setupConfirmPassword').value;
        const btn = document.getElementById('setupBtn');
        const errorEl = document.getElementById('setupError');

        if (!displayName || !email || !password) {
            errorEl.textContent = 'Please fill in all fields.';
            return;
        }
        if (password.length < 6) {
            errorEl.textContent = 'Password must be at least 6 characters.';
            return;
        }
        if (password !== confirmPassword) {
            errorEl.textContent = 'Passwords do not match.';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Creating Account...';
        errorEl.textContent = '';

        Auth.createFirstAdmin(email, password, displayName)
            .then(() => {
                DB.settings.save({
                    businessName: 'Akasya Coffee',
                    warehouseName: 'Main Warehouse',
                    currency: '\u20B1',
                    reorderLevel: 10,
                    theme: 'light'
                }).then(() => {
                    setupApp();
                    showToast('Welcome, Admin! Your account has been created.', 'success');
                    document.getElementById('setupForm').reset();
                });
            })
            .catch(err => {
                let msg = 'Failed to create account. Please try again.';
                if (err.code === 'auth/email-already-in-use') msg = 'This email is already registered.';
                if (err.code === 'auth/invalid-email') msg = 'Invalid email address.';
                if (err.code === 'auth/weak-password') msg = 'Password is too weak.';
                errorEl.textContent = msg;
            })
            .finally(() => {
                btn.disabled = false;
                btn.textContent = 'Create Admin Account';
            });
    }

    function handleLogout() {
        showLoading('Signing out...');
        DB.detachAllListeners();
        _unsubInventory = null;
        _unsubSuppliers = null;
        _unsubTransactions = null;
        _unsubRecipes = null;
        _unsubSettings = null;

        Auth.logout().then(() => {
            hideLoading();
            showLoginScreen();
            document.getElementById('loginForm').reset();
            document.getElementById('loginError').textContent = '';
        }).catch(() => {
            hideLoading();
            showLoginScreen();
        });
    }

    // ==========================================
    // USER DISPLAY
    // ==========================================
    function updateUserDisplay() {
        const avatarEl = document.getElementById('userAvatar');
        const nameEl = document.querySelector('.user-name');
        const roleEl = document.querySelector('.user-role');

        if (avatarEl) avatarEl.textContent = Auth.getAvatarText();
        if (nameEl) nameEl.textContent = Auth.getDisplayName();
        if (roleEl) roleEl.textContent = Auth.getRoleLabel();
    }

    // ==========================================
    // ROLE-BASED UI
    // ==========================================
    function applyRoleBasedUI() {
        const allowedPages = Auth.getAllowedPages();

        document.querySelectorAll('.nav-link[data-page]').forEach(link => {
            const page = link.dataset.page;
            if (allowedPages.includes(page)) {
                link.style.display = '';
            } else {
                link.style.display = 'none';
            }
        });

        document.querySelectorAll('.nav-section').forEach(section => {
            const visibleLinks = section.querySelectorAll('.nav-link:not([style*="display: none"])');
            section.style.display = visibleLinks.length > 0 ? '' : 'none';
        });

        const usersLink = document.querySelector('.nav-link[data-page="users"]');
        if (usersLink) {
            usersLink.style.display = Auth.isAdmin() ? '' : 'none';
        }
    }

    // ==========================================
    // NAVIGATION
    // ==========================================
    function navigate(page) {
        if (!Auth.canAccessPage(page)) {
            showToast('You do not have permission to access this page.', 'error');
            return;
        }

        currentPage = page;

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

        const pageEl = document.getElementById(page + 'Page');
        if (pageEl) pageEl.classList.add('active');

        const navLink = document.querySelector(`.nav-link[data-page="${page}"]`);
        if (navLink) navLink.classList.add('active');

        const titles = {
            dashboard: 'Dashboard',
            inventory: 'Inventory',
            receive: 'Receive Stock',
            transfer: 'Transfer Stock',
            suppliers: 'Suppliers',
            branches: 'Branches',
            recipes: 'Recipe / BOM',
            reports: 'Reports',
            settings: 'Settings',
            users: 'User Management'
        };
        const titleEl = document.getElementById('pageTitle');
        if (titleEl) titleEl.textContent = titles[page] || page;

        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('active');

        switch(page) {
            case 'dashboard': renderDashboard(); break;
            case 'inventory': InventoryModule.render(); break;
            case 'receive': renderReceive(); break;
            case 'transfer': renderTransfer(); break;
            case 'suppliers': SuppliersModule.render(); break;
            case 'branches': renderBranches(); break;
            case 'recipes': RecipesModule.render(); break;
            case 'reports': ReportsModule.render(); break;
            case 'settings': SettingsModule.render(); break;
            case 'users': renderUsers(); break;
        }

        window.scrollTo(0, 0);
    }

    // ==========================================
    // EVENT LISTENERS
    // ==========================================
    function setupEventListeners() {
        document.getElementById('menuToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.add('open');
            document.getElementById('sidebarOverlay').classList.add('active');
        });
        document.getElementById('sidebarClose').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebarOverlay').classList.remove('active');
        });
        document.getElementById('sidebarOverlay').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebarOverlay').classList.remove('active');
        });

        document.querySelectorAll('.nav-link[data-page]').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                navigate(link.dataset.page);
            });
        });

        document.getElementById('loginForm').addEventListener('submit', handleLogin);
        document.getElementById('setupForm').addEventListener('submit', handleSetup);
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);

        document.getElementById('globalSearch').addEventListener('input', debounce(e => {
            const val = e.target.value.toLowerCase();
            if (val.length > 2) {
                navigate('inventory');
                inventoryFilter.search = val;
                document.getElementById('invSearch').value = val;
                InventoryModule.render();
            }
        }, 300));

        document.getElementById('invSearch').addEventListener('input', debounce(e => {
            inventoryFilter.search = e.target.value.toLowerCase();
            inventoryPageNum = 1;
            InventoryModule.render();
        }, 200));
        document.getElementById('invCategoryFilter').addEventListener('change', e => {
            inventoryFilter.category = e.target.value;
            inventoryPageNum = 1;
            InventoryModule.render();
        });
        document.getElementById('invSupplierFilter').addEventListener('change', e => {
            inventoryFilter.supplier = e.target.value;
            inventoryPageNum = 1;
            InventoryModule.render();
        });
        document.getElementById('invStatusFilter').addEventListener('change', e => {
            inventoryFilter.status = e.target.value;
            inventoryPageNum = 1;
            InventoryModule.render();
        });

        document.querySelectorAll('#inventoryTable thead th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const field = th.dataset.sort;
                if (inventorySort.field === field) {
                    inventorySort.dir = inventorySort.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    inventorySort.field = field;
                    inventorySort.dir = 'asc';
                }
                document.querySelectorAll('#inventoryTable thead th.sortable').forEach(t => {
                    t.classList.remove('asc', 'desc');
                });
                th.classList.add(inventorySort.dir);
                InventoryModule.render();
            });
        });

        // SAFELY LOOK FOR FORMS ONLY IF THEY EXIST IN HTML
        const receiveForm = document.getElementById('receiveForm');
        if (receiveForm) {
            receiveForm.addEventListener('submit', e => {
                e.preventDefault();
                InventoryModule.submitReceive();
            });
        }

        const transferForm = document.getElementById('transferForm');
        if (transferForm) {
            transferForm.addEventListener('submit', e => {
                e.preventDefault();
                InventoryModule.submitTransfer();
            });
        }

        const adjustForm = document.getElementById('adjustForm');
        if (adjustForm) {
            adjustForm.addEventListener('submit', e => {
                e.preventDefault();
                InventoryModule.submitAdjustment();
            });
        }

        const adjustItem = document.getElementById('adjustItem');
        if (adjustItem) adjustItem.addEventListener('change', () => InventoryModule.updateAdjustCurrentQty());
        
        const adjustLocation = document.getElementById('adjustLocation');
        if (adjustLocation) adjustLocation.addEventListener('change', () => InventoryModule.updateAdjustCurrentQty());

        document.querySelectorAll('.transfer-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.transfer-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.transfer-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const panelId = 'transfer' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1) + 'Panel';
                const panel = document.getElementById(panelId);
                if (panel) panel.classList.add('active');
                if (tab.dataset.tab === 'history') renderTransferHistory();
            });
        });

        document.querySelectorAll('.report-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.report-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const reportId = 'report' + tab.dataset.report.charAt(0).toUpperCase() + tab.dataset.report.slice(1);
                const panel = document.getElementById(reportId);
                if (panel) panel.classList.add('active');
                ReportsModule.renderPanel(tab.dataset.report);
            });
        });

        const rType = document.getElementById('reportTransType');
        if (rType) rType.addEventListener('change', () => ReportsModule.renderTransactions());
        const rFrom = document.getElementById('reportTransFrom');
        if (rFrom) rFrom.addEventListener('change', () => ReportsModule.renderTransactions());
        const rTo = document.getElementById('reportTransTo');
        if (rTo) rTo.addEventListener('change', () => ReportsModule.renderTransactions());

        const tFrom = document.getElementById('transferFromFilter');
        if (tFrom) tFrom.addEventListener('change', () => renderTransferHistory());
        const tTo = document.getElementById('transferToFilter');
        if (tTo) tTo.addEventListener('change', () => renderTransferHistory());
        const tDate = document.getElementById('transferDateFilter');
        if (tDate) tDate.addEventListener('change', () => renderTransferHistory());

        const sSearch = document.getElementById('supplierSearch');
        if (sSearch) sSearch.addEventListener('input', debounce(e => SuppliersModule.render(e.target.value.toLowerCase()), 200));

        const recSearch = document.getElementById('recipeSearch');
        if (recSearch) recSearch.addEventListener('input', debounce(e => RecipesModule.render(e.target.value.toLowerCase()), 200));

        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', e => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
                document.body.style.overflow = '';
            }
        });
    }

    // ==========================================
    // DASHBOARD
    // ==========================================
    function renderDashboard() {
        const items = _inventoryData;
        const transactions = _transactionsData;

        let inventoryValue = 0;
        let lowStock = 0;
        let criticalStock = 0;
        items.forEach(item => {
            const total = (item.qtyWarehouse || 0) + (item.qtyBamban || 0) + (item.qtyCapas || 0);
            inventoryValue += total * (item.cost || 0);
            const status = getStatus(item);
            if (status === 'Low') lowStock++;
            if (status === 'Critical') criticalStock++;
        });

        const today = todayStr();
        const todayTxs = transactions.filter(t => t.date === today);

        document.getElementById('dashInventoryValue').textContent = formatCurrency(inventoryValue);
        document.getElementById('dashTotalProducts').textContent = items.length;
        document.getElementById('dashLowStock').textContent = lowStock;
        document.getElementById('dashCriticalStock').textContent = criticalStock;
        document.getElementById('dashTodayTransactions').textContent = todayTxs.length;
        document.getElementById('dashPendingTransfers').textContent = transactions.filter(t => t.type === 'Transfer' && t.date === today).length;

        const totalAlerts = lowStock + criticalStock;
        const badge = document.getElementById('notifBadge');
        if (badge) {
            badge.textContent = totalAlerts;
            badge.style.display = totalAlerts > 0 ? 'flex' : 'none';
        }

        const tbody = document.getElementById('dashLowStockTable');
        const lowStockItems = items.filter(i => {
            const s = getStatus(i
