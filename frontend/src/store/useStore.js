import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const API_URL = import.meta.env.VITE_API_URL || '';

export const useStore = create(
    persist(
        (set, get) => ({
            profile: {
                name: '',
                username: '',
                age: 22,
                gender: '',
                height: 170,
                weight: 70,
                bmi: 24.2,
                dailyLimit: 30,
                onboarded: false,
                avatar: '👤',
                activity: { steps: 4500, sleepHours: 7 },
                anonymousID: null,
                mongoId: null,
                points: 0
            },
            history: [],
            totalToday: 0,
            streak: 0,
            loading: false,
            notification: null,
            leaderboard: [],

            // HELPER: Calculate BMI locally
            _calcBMI: (w, h) => {
                const heightMeters = h / 100;
                return parseFloat((w / (heightMeters * heightMeters)).toFixed(1));
            },

            // HELPER: Re-calculate daily stats from history
            _recalcDailyStats: () => {
                const { history } = get();
                const today = new Date().setHours(0, 0, 0, 0);
                const total = history
                    .filter(e => new Date(e.timestamp).setHours(0, 0, 0, 0) === today)
                    .reduce((acc, curr) => acc + curr.sugarGrams, 0);
                set({ totalToday: total });
            },

            // HELPER: Calculate XP Stats
            getXPStats: () => {
                const history = get().history;
                const today = new Date();
                const currentMonth = today.getMonth();
                const currentYear = today.getFullYear();

                // XP Today
                const todayEvents = history.filter(e => new Date(e.timestamp).toDateString() === today.toDateString());
                const xpToday = todayEvents.reduce((acc, curr) => acc + (curr.pointsEarned || 0), 0);

                // XP This Month
                const monthEvents = history.filter(e => {
                    const d = new Date(e.timestamp);
                    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
                });
                const xpMonth = monthEvents.reduce((acc, curr) => acc + (curr.pointsEarned || 0), 0);

                return { xpToday, xpMonth };
            },

            // ACTIONS
            fetchLeaderboard: async (timeframe = 'daily') => {
                try {
                    const res = await fetch(`${API_URL}/api/users/leaderboard?timeframe=${timeframe}`);
                    if (res.ok) {
                        const data = await res.json();
                        set({ leaderboard: data });
                    }
                } catch (error) {
                    console.error("Leaderboard Error:", error);
                }
            },

            login: async (username) => {
                set({ loading: true });
                try {
                    const res = await fetch(`${API_URL}/api/users/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username })
                    });

                    if (res.ok) {
                        const user = await res.json();
                        // Load user data and history
                        set(state => ({
                            profile: { ...state.profile, ...user, mongoId: user._id, onboarded: true }
                        }));
                        await get().initializeData(); // Fetch history
                        get().fetchLeaderboard(); // Fetch leaderboard
                        return true; // Login success
                    } else if (res.status === 404) {
                        set({ loading: false });
                        return false; // User not found
                    }
                } catch (error) {
                    console.error("Login Error:", error);
                    set({ loading: false });
                    throw error;
                }
            },

            logout: () => {
                set({
                    profile: {
                        name: '',
                        username: '',
                        age: 22,
                        gender: '',
                        height: 170,
                        weight: 70,
                        bmi: 24.2,
                        dailyLimit: 30,
                        onboarded: false,
                        avatar: '👤',
                        activity: { steps: 4500, sleepHours: 7 },
                        anonymousID: null,
                        mongoId: null,
                        points: 0
                    },
                    history: [],
                    totalToday: 0,
                    streak: 0,
                    leaderboard: []
                });
                localStorage.removeItem('sugar_warrior_storage');
            },

            setProfile: async (updates) => {
                const currentProfile = get().profile;
                let newProfile = { ...currentProfile, ...updates };

                if (updates.height || updates.weight) {
                    newProfile.bmi = get()._calcBMI(newProfile.weight, newProfile.height);
                }
                set({ profile: newProfile });

                // Backend Sync (Update Only)
                try {
                    if (newProfile.anonymousID) {
                        await fetch(`${API_URL}/api/users/${newProfile.anonymousID}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(updates)
                        });
                    }
                } catch (error) {
                    console.error("Sync Error:", error);
                }
            },

            register: async () => {
                set({ loading: true });
                const { profile } = get();
                try {
                    const res = await fetch(`${API_URL}/api/users`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...profile,
                            onboarded: true,
                            anonymousID: profile.anonymousID || Math.random().toString(36).substr(2, 9)
                        })
                    });

                    if (res.ok) {
                        const user = await res.json();
                        set(state => ({
                            profile: { ...state.profile, ...user, mongoId: user._id, onboarded: true },
                            loading: false
                        }));
                        get().fetchLeaderboard(); // Fetch initial leaderboard
                        return true;
                    } else {
                        throw new Error('Registration failed');
                    }
                } catch (error) {
                    console.error("Registration Error:", error);
                    set({ loading: false });
                    return false;
                }
            },

            addEntry: async (entry) => {
                const { profile, history } = get();
                // Check duplicate (simple check)
                if (history.some(e => e.timestamp === entry.timestamp)) return;

                // Optimistic UI Update
                const newHistory = [entry, ...history];
                set({ history: newHistory });
                get()._recalcDailyStats();

                try {
                    const res = await fetch(`${API_URL}/api/sugar-events`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId: profile.mongoId,
                            ...entry,
                            isRecommendation: entry.isRecommendation || false
                        })
                    });

                    if (res.ok) {
                        const data = await res.json();

                        // Update State with new points and streak AND replace optimistic entry
                        set(state => {
                            const updatedHistory = state.history.map(e =>
                                e.id === entry.id ? { ...e, ...data, id: data._id, foodName: data.itemName } : e
                            );

                            return {
                                history: updatedHistory,
                                streak: data.streak || state.streak,
                                profile: {
                                    ...state.profile,
                                    points: (state.profile.points || 0) + (data.pointsEarned || 0)
                                },
                                notification: data.pointsEarned > 0 ? {
                                    points: data.pointsEarned,
                                    messages: data.pointsMessages
                                } : null
                            };
                        });

                        // Auto-clear notification
                        if (data.pointsEarned > 0) {
                            setTimeout(() => set({ notification: null }), 4000);
                        }

                        return { pointsEarned: data.pointsEarned, messages: data.pointsMessages };
                    }
                } catch (e) { console.error("Event Sync Failed", e); }
            },

            clearNotification: () => set({ notification: null }),

            removeEntry: (id) => set((state) => {
                const newHistory = state.history.filter(e => e.id !== id);
                return { history: newHistory }; // _recalcDailyStats will be called if needed, or we just update totalToday here
            }), // Simpler version for now, _recalcDailyStats logic is safer

            initializeData: async () => {
                const { profile } = get();
                if (!profile.anonymousID) return;

                set({ loading: true });
                try {
                    const userRes = await fetch(`${API_URL}/api/users/${profile.anonymousID}`);
                    if (userRes.ok) {
                        const user = await userRes.json();
                        const eventsRes = await fetch(`${API_URL}/api/sugar-events/${user._id}`);
                        const events = eventsRes.ok ? await eventsRes.json() : [];

                        // Map Backend Fields
                        const mappedEvents = events.map(e => ({
                            ...e,
                            id: e._id,
                            foodName: e.itemName
                        }));

                        set({ profile: { ...profile, ...user, mongoId: user._id }, history: mappedEvents });
                        get()._recalcDailyStats();
                    } else if (userRes.status === 404) {
                        console.warn("User ID invalid (404). Resetting profile.");
                        get().logout();
                    }
                } catch (e) { console.error("Init Error", e); }
                finally { set({ loading: false }); }
            },

            resetProgress: () => set({ history: [], totalToday: 0, streak: 0 })
        }),
        {
            name: 'sugar-warrior-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({ profile: state.profile, history: state.history, leaderboard: state.leaderboard }),
        }
    )
);