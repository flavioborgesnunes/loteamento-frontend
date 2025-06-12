import { create } from 'zustand';
import { mountStoreDevtool } from 'simple-zustand-devtools';

const useAuthStore = create((set, get) => ({
    allUserData: null, // token (jwtDecode)
    perfilUser: null,  // dados atualizados de perfil via /user/

    loading: false,

    user: () => ({
        user_id: get().allUserData?.user_id || null,
        email: get().allUserData?.email || null,
        role: get().allUserData?.role || null,
        dono: get().allUserData?.dono || null,
    }),

    setUser: (user) => set({ allUserData: user }),

    setPerfilUser: (perfil) => set({ perfilUser: perfil }),

    setLoading: (loading) => set({ loading }),

    isLoggedIn: () => get().allUserData !== null,

    isDono: () => get().allUserData?.role === 'dono',

    isAdm: () => get().allUserData?.role === 'adm',

    isComum: () => get().allUserData?.role === 'comum',
}));

if (import.meta.env.DEV) {
    mountStoreDevtool('Store', useAuthStore);
}

export { useAuthStore };
