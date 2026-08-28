        import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

        const SUPABASE_URL = "https://rxkumheztyyamchhejlk.supabase.co";
        const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_cN9rnx7YGQm8a-dfxMQCgw_6Ho1yrzj";
        const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

        const LOCAL_STORAGE_PREFIX = "apppun_tax_manager_local_state";
        function getLocalStorageKey(uid) {
            return uid ? `${LOCAL_STORAGE_PREFIX}_${uid}` : `${LOCAL_STORAGE_PREFIX}_guest`;
        }

        const npwpToEmail = (npwp) => `${npwp.trim()}@umkm-pajak.id`;

        let currentUser = null;
        let currentLocalKey = null;
        let unsubscribeRealtime = null;
        let isRemoteUpdate = false;
        let chartInstance = null;
        let cloudSaveTimer = null;

        const allMonthsList = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const monthOrder = { 'Januari': 1, 'Februari': 2, 'Maret': 3, 'April': 4, 'Mei': 5, 'Juni': 6, 'Juli': 7, 'Agustus': 8, 'September': 9, 'Oktober': 10, 'November': 11, 'Desember': 12 };

        const defaultState = {
            entityMode: "umkm",
            activeStoreId: "store_default",
            personalProfile: {
                nama: "Eugene Siby", tipePekerjaan: "freelance", statusPTKP: "54000000",
                freelanceNorma: "0.5", jenisKendaraan: "mobil", njkb: 150000000, kepemilikan: "0.02",
                selectedYear: 2026, activeTabIndex: 0,
                monthsData: [
                    { name: 'Januari', year: 2026, gajiPokok: 10000000, tunjangan: 2000000, iuran: 200000, freelanceBruto: 15000000 },
                    { name: 'Februari', year: 2026, gajiPokok: 10000000, tunjangan: 2000000, iuran: 200000, freelanceBruto: 18000000 }
                ]
            },
            stores: [{
                id: "store_default",
                profile: { namaUsaha: "Kopi Berkah Nusantara", npwp: "7326011206010003", kodeCabang: "000000", jenisWP: "OP", kategoriUsaha: "Kuliner / Makanan & Minuman", targetOmzet: 500000000 },
                selectedYear: 2026, activeTabIndex: 0,
                monthsData: [{ name: 'Januari', year: 2026, beban: 1200000, transactions: [{ id: 'tx_1', transactionDate: '2026-01-15', customer: 'Alisha', billing: 'STRUK-ABC', discount: 25000, items: [{ name: 'Lego City Undercover Cart', price: 600000, qty: 5 }, { name: 'Minecraft', price: 500000, qty: 2 }], omzet: 3975000 }], omzet: 3975000 }]
            }]
        };

        function buildDefaultState(npwp, namaUsaha) {
            const year = new Date().getFullYear();
            return { entityMode: "umkm", activeStoreId: "store_1", personalProfile: { nama: namaUsaha || "", tipePekerjaan: "karyawan", statusPTKP: "54000000", freelanceNorma: "0.5", jenisKendaraan: "mobil", njkb: 0, kepemilikan: "0.02", selectedYear: year, activeTabIndex: 0, monthsData: [{ name: 'Januari', year, gajiPokok: 0, tunjangan: 0, iuran: 0, freelanceBruto: 0 }] }, stores: [{ id: "store_1", profile: { namaUsaha: namaUsaha || "", npwp: npwp || "7326011206010003", kodeCabang: "000000", jenisWP: "OP", kategoriUsaha: "Retail & Kelontong", targetOmzet: 500000000 }, selectedYear: year, activeTabIndex: 0, monthsData: [{ name: 'Januari', year, beban: 0, transactions: [{ id: 'tx_' + Date.now(), transactionDate: `${year}-01-15`, customer: 'Pelanggan Umum', billing: '', discount: 0, items: [{ name: 'Penjualan Barang / Jasa', price: 0, qty: 1 }], omzet: 0 }], omzet: 0 }] }] };
        }

        window.appState = defaultState;

        async function fetchRealUserCount() {
            const labels = document.querySelectorAll('.real-user-count-label');
            labels.forEach(el => { el.textContent = 'Memuat total pengguna...'; });
            try {
                const { data, error } = await supabase.rpc('get_public_user_count');
                if (error) throw error;
                const formatted = new Intl.NumberFormat('id-ID').format(Number(data || 0));
                labels.forEach(el => { el.textContent = `${formatted} Wajib Pajak Terdaftar`; });
            } catch (err) {
                console.warn('Gagal mengambil jumlah pengguna dari Supabase:', err);
                labels.forEach(el => { el.textContent = '0 Wajib Pajak Terdaftar'; });
            }
        }

        function getActiveStore() { let store = window.appState.stores.find(s => s.id === window.appState.activeStoreId); if (!store) { store = window.appState.stores[0]; window.appState.activeStoreId = store ? store.id : "store_default"; } return store; }
        function saveLocalState() { if (!currentLocalKey) return; try { localStorage.setItem(currentLocalKey, JSON.stringify(window.appState)); } catch (e) { console.error("Local save error:", e); } }
        function setSyncIndicatorStatus(syncing) { const dot = document.getElementById('syncStatusDot'); const txt = document.getElementById('syncStatusText'); if (dot && txt) { if (syncing) { dot.className = 'sync-dot syncing'; txt.textContent = 'Menyinkronkan...'; } else { dot.className = 'sync-dot'; txt.textContent = 'Tersinkron'; } } }
        let syncErrorShown = false;
        function setSyncErrorStatus(reason) { const dot = document.getElementById('syncStatusDot'); const txt = document.getElementById('syncStatusText'); if (dot && txt) { dot.className = 'sync-dot sync-error'; txt.textContent = reason === 'permission-denied' ? 'Sync ditolak' : 'Sync gagal'; } if (!syncErrorShown && reason === 'permission-denied') { syncErrorShown = true; alert("Sinkronisasi cloud DITOLAK oleh Supabase Row Level Security.\n\nData tersimpan secara lokal."); } }

        window.showAuthPage = function(page) {
            const login = document.getElementById('loginCard'), signup = document.getElementById('signupCard'), forgot = document.getElementById('forgotCard');
            if (login) login.style.display = page === 'login' ? 'block' : 'none';
            if (signup) signup.style.display = page === 'signup' ? 'block' : 'none';
            if (forgot) forgot.style.display = page === 'forgot' ? 'block' : 'none';
        };

        document.addEventListener('click', (event) => {
            const link = event.target.closest('.auth-switch') || (event.target.closest('a') && event.target.closest('a').textContent.includes('Daftar Akun Baru') ? event.target.closest('a') : null);
            if (!link) return;
            event.preventDefault();
            const page = link.dataset.authPage || (link.textContent.includes('Daftar Akun Baru') ? 'signup' : link.textContent.includes('Lupa') ? 'forgot' : 'login');
            window.showAuthPage(page);
        });

        async function handleAuthenticatedUser(user) {
            if (cloudSaveTimer) { clearTimeout(cloudSaveTimer); cloudSaveTimer = null; }
            currentUser = user;
            const npwp = (user.email || '').split('@')[0];
            currentLocalKey = getLocalStorageKey(user.id);
            document.getElementById('authOverlay').style.display = 'none';
            document.getElementById('displayUserNpwp').textContent = `NPWP: ${npwp}`;
            document.getElementById('nomorNPWP').value = npwp;
            await listenToCloudData(user.id, npwp);
            fetchRealUserCount();
        }
        async function handleSignedOut() { if (unsubscribeRealtime) { try { await unsubscribeRealtime(); } catch (_) {} unsubscribeRealtime = null; } currentUser = null; currentLocalKey = null; window.appState = defaultState; document.getElementById('authOverlay').style.display = 'flex'; window.showAuthPage('login'); }

        async function listenToCloudData(uid, npwp) {
            if (unsubscribeRealtime) { try { await unsubscribeRealtime(); } catch (_) {} unsubscribeRealtime = null; }
            setSyncIndicatorStatus(true);
            try {
                const { data, error } = await supabase.from('app_state').select('state, updated_at').eq('user_id', uid).maybeSingle();
                if (error) throw error;
                if (data?.state) { isRemoteUpdate = true; window.appState = data.state; saveLocalState(); initUI(); isRemoteUpdate = false; }
                else {
                    const cached = currentLocalKey ? localStorage.getItem(currentLocalKey) : null;
                    const freshState = cached ? JSON.parse(cached) : buildDefaultState(npwp);
                    isRemoteUpdate = true; window.appState = freshState; saveLocalState(); initUI(); isRemoteUpdate = false;
                    const { error: saveError } = await supabase.from('app_state').upsert({ user_id: uid, state: freshState, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
                    if (saveError) throw saveError;
                }
                setSyncIndicatorStatus(false); syncErrorShown = false;
            } catch (error) {
                console.error('Supabase initial sync error:', error); setSyncIndicatorStatus(false);
                if (currentLocalKey) { try { const cached = localStorage.getItem(currentLocalKey); window.appState = cached ? JSON.parse(cached) : buildDefaultState(npwp); } catch (e) { window.appState = buildDefaultState(npwp); } initUI(); }
                if (error?.code === '42501' || error?.status === 401 || error?.status === 403) setSyncErrorStatus('permission-denied');
            }
            const channel = supabase.channel(`app-state-${uid}`).on('postgres_changes', { event: '*', schema: 'public', table: 'app_state', filter: `user_id=eq.${uid}` }, payload => { if (payload.new?.state && !isRemoteUpdate) { isRemoteUpdate = true; window.appState = payload.new.state; saveLocalState(); initUI(); isRemoteUpdate = false; setSyncIndicatorStatus(false); } }).subscribe();
            unsubscribeRealtime = async () => { await supabase.removeChannel(channel); };
        }

        window.saveDataToCloud = function() {
            saveLocalState(); if (isRemoteUpdate || !currentUser) return; setSyncIndicatorStatus(true); if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
            cloudSaveTimer = setTimeout(async () => { cloudSaveTimer = null; if (!currentUser) return; try { const { error } = await supabase.from('app_state').upsert({ user_id: currentUser.id, state: window.appState, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }); if (error) throw error; setSyncIndicatorStatus(false); syncErrorShown = false; } catch (err) { console.error('Supabase cloud save error:', err); setSyncIndicatorStatus(false); if (err?.code === '42501' || err?.status === 401 || err?.status === 403) setSyncErrorStatus('permission-denied'); } }, 700);
        };

        window.handleLogin = async function(e) { e.preventDefault(); const npwp = document.getElementById('loginNpwp').value.trim(); const password = document.getElementById('loginPassword').value; if (npwp.length !== 16) return alert('NIK/NPWP harus 16 digit!'); try { const { error } = await supabase.auth.signInWithPassword({ email: npwpToEmail(npwp), password }); if (error) throw error; } catch (err) { alert('Gagal masuk: ' + (err.message || err)); } };

        window.handleSignup = async function(e) {
            e.preventDefault();
            const npwp = document.getElementById('signupNpwp').value.trim(), namaUsaha = document.getElementById('signupNamaUsaha').value.trim(), phone = document.getElementById('signupPhone').value.trim(), password = document.getElementById('signupPassword').value;
            if (npwp.length !== 16) return alert('NIK/NPWP harus 16 digit!');
            if (password.length < 6) return alert('Password minimal 6 karakter!');
            try {
                const { data, error } = await supabase.auth.signUp({ email: npwpToEmail(npwp), password, options: { data: { npwp, full_name: namaUsaha, phone }, emailRedirectTo: window.location.origin } });
                if (error) throw error;
                const user = data.user; if (!user) throw new Error('Akun belum dibuat.');
                const initialData = buildDefaultState(npwp, namaUsaha); initialData.stores[0].profile.phone = phone; window.appState = initialData; currentLocalKey = getLocalStorageKey(user.id); saveLocalState();
                const { error: profileError } = await supabase.from('profiles').upsert({ id: user.id, full_name: namaUsaha, tax_type: 'umkm', npwp, updated_at: new Date().toISOString() }, { onConflict: 'id' });
                if (profileError) throw profileError;
                if (data.session) { const { error: stateError } = await supabase.from('app_state').upsert({ user_id: user.id, state: initialData, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }); if (stateError) throw stateError; alert('Pendaftaran berhasil!'); }
                else { alert('Pendaftaran berhasil. Silakan cek email untuk verifikasi akun, lalu masuk.'); window.showAuthPage('login'); }
                fetchRealUserCount();
            } catch (err) { alert('Gagal mendaftar: ' + (err.message || err)); }
        };

        window.handleForgot = async function(e) { e.preventDefault(); const npwp = document.getElementById('forgotNpwp').value.trim(); if (npwp.length !== 16) return alert('NIK/NPWP harus 16 digit!'); try { const { error } = await supabase.auth.resetPasswordForEmail(npwpToEmail(npwp), { redirectTo: window.location.origin }); if (error) throw error; alert('Instruksi reset password dikirim.'); window.showAuthPage('login'); } catch (err) { alert('Reset gagal: ' + (err.message || err)); } };
        window.handleLogout = async function() { if (confirm('Keluar dari akun?')) { if (cloudSaveTimer) clearTimeout(cloudSaveTimer); await supabase.auth.signOut(); if (currentLocalKey) localStorage.removeItem(currentLocalKey); location.reload(); } };

        // The rest of the application is unchanged from the uploaded AppPUN source.
